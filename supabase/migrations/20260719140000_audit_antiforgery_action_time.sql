-- Audit anti-forgery + action-time timestamps (whole-system audit follow-up).
--
-- Problem 1 (forgery): any active member could INSERT arbitrary rows into
-- equipment_audit for their own org — any equipment_id, any actor string, any
-- action — fabricating history that blames someone else. The client insert
-- path existed because (a) the audit trigger was SECURITY INVOKER, so trigger
-- inserts needed a client policy, and (b) mobile hand-wrote its audit rows.
--
-- Problem 2 (duplicates): mobile hand-wrote audit rows for create/edit/delete/
-- move even though the equipment_items trigger already logs those — every
-- mobile action produced two history rows.
--
-- Problem 3 (timestamps): offline actions were stamped at sync time, not
-- action time. Mobile already sends updated_at = action time in its payloads;
-- set_updated_at() just clobbered it with now().
--
-- Design:
--   * log_equipment_audit becomes SECURITY DEFINER (owner bypasses RLS), so
--     trigger-generated audit needs no client policy at all.
--   * Two SECURITY DEFINER RPCs cover what the trigger can't infer:
--     log_damage_event (notes) and log_merge_event (merged_from metadata).
--     Actor is derived server-side from the caller's profile — impersonation
--     is structurally impossible.
--   * The client insert policy is DROPPED. Nobody hand-writes audit rows
--     anymore. (Older mobile builds still try: their writes fail gracefully —
--     both apps treat audit-write failure as non-blocking — and the trigger
--     still records the underlying change, so only damage-notes/merge-detail
--     degrade until those builds update.)
--   * set_updated_at keeps an explicitly-supplied PAST updated_at (offline
--     replay), and the audit trigger stamps `at` from it — action time.
--     Clients that don't send updated_at (web) behave exactly as before.

-- ── 1. set_updated_at: respect explicit past timestamps ──────────────────────
create or replace function public.set_updated_at()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Keep a supplied past timestamp (offline-created rows); clamp future.
    if new.updated_at is null or new.updated_at > now() then
      new.updated_at = now();
    end if;
  else
    -- Only treat updated_at as intentional when the client actually changed
    -- it; an untouched value means "not supplied" (PostgREST carries OLD
    -- forward), which must bump to now() like always.
    if new.updated_at is not distinct from old.updated_at
       or new.updated_at is null
       or new.updated_at > now() then
      new.updated_at = now();
    end if;
  end if;
  return new;
end;
$$;

-- ── 2. Audit trigger: SECURITY DEFINER + action-time `at` ────────────────────
create or replace function public.log_equipment_audit()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  act text;
begin
  if (tg_op = 'INSERT') then
    insert into public.equipment_audit (
      org_id, user_id, equipment_id, action, actor, at, snapshot_after
    ) values (
      new.org_id, auth.uid(), new.id, 'create', new.updated_by,
      coalesce(new.updated_at, now()),
      to_jsonb(new)
    );
    return new;
  end if;

  if (tg_op = 'UPDATE') then
    if (new.location is distinct from old.location) then
      act := 'move';
    else
      act := 'update';
    end if;

    insert into public.equipment_audit (
      org_id, user_id, equipment_id, action, actor, at,
      from_location, to_location, delta_qty,
      snapshot_before, snapshot_after
    ) values (
      new.org_id, auth.uid(), new.id, act, new.updated_by,
      coalesce(new.updated_at, now()),
      old.location, new.location,
      (coalesce(new.quantity,0) - coalesce(old.quantity,0)),
      to_jsonb(old), to_jsonb(new)
    );
    return new;
  end if;

  if (tg_op = 'DELETE') then
    -- No carrier for the action time of a delete (queued deletes ship only an
    -- id), so deletes are stamped at sync time.
    insert into public.equipment_audit (
      org_id, user_id, equipment_id, action, actor, from_location, snapshot_before
    ) values (
      old.org_id, auth.uid(), old.id, 'delete', old.updated_by, old.location,
      to_jsonb(old)
    );
    return old;
  end if;

  return null;
end;
$$;

-- ── 3. RPCs for semantic events the trigger can't infer ──────────────────────
-- Actor is server-derived; p_at is clamped to the past (offline replay may
-- legitimately backdate, but never into the future).

create or replace function public.log_damage_event(
  p_equipment_id uuid,
  p_notes text default null,
  p_at timestamptz default null
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_org uuid;
  v_actor text;
begin
  select e.org_id into v_org from public.equipment_items e where e.id = p_equipment_id;
  if v_org is null then
    raise exception 'equipment not found' using errcode = 'P0002';
  end if;
  if not (public.is_active_member(v_org) or public.ghost_can_write(v_org)) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;

  select coalesce(nullif(trim(p.full_name), ''), p.email, 'Unknown')
    into v_actor from public.profiles p where p.id = auth.uid();

  insert into public.equipment_audit (org_id, user_id, equipment_id, action, actor, at, meta)
  values (
    v_org, auth.uid(), p_equipment_id, 'damage', coalesce(v_actor, 'Unknown'),
    case when p_at is null or p_at > now() then now() else p_at end,
    case when p_notes is not null and trim(p_notes) <> '' then jsonb_build_object('notes', p_notes) else null end
  );
end;
$$;

create or replace function public.log_merge_event(
  p_into uuid,
  p_from uuid,
  p_qty int,
  p_from_location text,
  p_to_location text,
  p_at timestamptz default null
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_org uuid;
  v_actor text;
begin
  -- Resolve org from the surviving (destination) row — the source row may
  -- already be deleted by the time a full merge logs.
  select e.org_id into v_org from public.equipment_items e where e.id = p_into;
  if v_org is null then
    raise exception 'equipment not found' using errcode = 'P0002';
  end if;
  if not (public.is_active_member(v_org) or public.ghost_can_write(v_org)) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;

  select coalesce(nullif(trim(p.full_name), ''), p.email, 'Unknown')
    into v_actor from public.profiles p where p.id = auth.uid();

  insert into public.equipment_audit (
    org_id, user_id, equipment_id, action, actor, at,
    from_location, to_location, delta_qty, meta
  ) values (
    v_org, auth.uid(), p_into, 'merge', coalesce(v_actor, 'Unknown'),
    case when p_at is null or p_at > now() then now() else p_at end,
    p_from_location, p_to_location, p_qty,
    jsonb_build_object('merged_from_id', p_from, 'merged_into_id', p_into)
  );
end;
$$;

revoke all on function public.log_damage_event(uuid, text, timestamptz) from public;
revoke all on function public.log_damage_event(uuid, text, timestamptz) from anon;
grant execute on function public.log_damage_event(uuid, text, timestamptz) to authenticated;

revoke all on function public.log_merge_event(uuid, uuid, int, text, text, timestamptz) from public;
revoke all on function public.log_merge_event(uuid, uuid, int, text, text, timestamptz) from anon;
grant execute on function public.log_merge_event(uuid, uuid, int, text, text, timestamptz) to authenticated;

-- ── 4. Close the forgery hole ────────────────────────────────────────────────
-- Trigger inserts bypass RLS now (definer), RPCs cover damage/merge — no
-- client ever needs to insert audit rows directly again.
drop policy if exists "audit: members insert" on public.equipment_audit;
-- The ghost's audit insert policy existed only so armed-ghost equipment edits
-- could satisfy the old invoker trigger; unnecessary now.
drop policy if exists "platform_admin_write_ins" on public.equipment_audit;

-- ── 5. Drop the orphaned dev-only trigger function ───────────────────────────
-- Written for an equipment_items_dev table that exists in no migration; no
-- trigger references it.
drop function if exists public.log_equipment_audit_dev();
