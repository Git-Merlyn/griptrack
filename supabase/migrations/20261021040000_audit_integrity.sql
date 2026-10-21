-- WP04 (audit M20, L63, L64) — audit integrity.
--
-- M20: equipment_audit.actor on trigger rows was copied from the client-written
--      equipment_items.updated_by, and `at` from updated_at with no lower
--      bound, so a member could record "Alice deleted this in 2019".
--      Now: actor is derived from the caller's profile (as the damage/merge
--      RPCs already do; deletes are attributed to the deleter, not the last
--      editor), and client-supplied action times older than 30 days are
--      restamped to now() (offline replay inside 30 days keeps action time).
-- L63: two permissive SELECT policies on equipment_audit, neither team-scoped:
--      crew in a teams-on org could read every team's audit rows including
--      full snapshots of gear they cannot SELECT. Now: audit rows carry the
--      item's team_id (stamped by the trigger and both RPCs, backfilled), and
--      one policy mirrors the equipment_items read rules.
-- L64: log_damage_event / log_merge_event authorised on org membership only;
--      now they apply the same owner/admin | teams-off | same-team rule.
--
-- Signatures of log_damage_event / log_merge_event are unchanged (shipped
-- mobile builds call them and replay queued calls by name).

-- ── 1. set_updated_at: add a 30-day lower clamp ─────────────────────────────
create or replace function public.set_updated_at()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Keep a supplied past timestamp (offline-created rows); clamp future
    -- and anything older than 30 days (backdating protection).
    if new.updated_at is null
       or new.updated_at > now()
       or new.updated_at < now() - interval '30 days' then
      new.updated_at = now();
    end if;
  else
    -- Only treat updated_at as intentional when the client actually changed
    -- it; an untouched value means "not supplied" (PostgREST carries OLD
    -- forward), which must bump to now() like always.
    if new.updated_at is not distinct from old.updated_at
       or new.updated_at is null
       or new.updated_at > now()
       or new.updated_at < now() - interval '30 days' then
      new.updated_at = now();
    end if;
  end if;
  return new;
end;
$$;

-- ── 2. equipment_audit.team_id (stamp + backfill) ───────────────────────────
-- No FK on purpose: it is a historical stamp and must survive team deletion.
alter table public.equipment_audit add column if not exists team_id uuid;

update public.equipment_audit a
   set team_id = coalesce(
         nullif(a.snapshot_after ->> 'team_id', '')::uuid,
         nullif(a.snapshot_before ->> 'team_id', '')::uuid,
         (select e.team_id from public.equipment_items e where e.id = a.equipment_id)
       )
 where a.team_id is null;

create index if not exists equipment_audit_org_team_at_idx
  on public.equipment_audit (org_id, team_id, at desc);

-- ── 3. Audit trigger: server-derived actor + team stamp ─────────────────────
create or replace function public.log_equipment_audit()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  act text;
  v_actor text;
begin
  -- Actor comes from the caller's profile, never from the client-written
  -- updated_by. Only callers without a JWT (service role, SQL editor,
  -- migrations) fall back to updated_by.
  if auth.uid() is not null then
    select coalesce(nullif(trim(p.full_name), ''), p.email)
      into v_actor
      from public.profiles p
     where p.id = auth.uid();
    v_actor := coalesce(v_actor, 'Unknown');
  end if;

  if (tg_op = 'INSERT') then
    insert into public.equipment_audit (
      org_id, user_id, equipment_id, team_id, action, actor, at, snapshot_after
    ) values (
      new.org_id, auth.uid(), new.id, new.team_id, 'create',
      coalesce(v_actor, new.updated_by, 'system'),
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
      org_id, user_id, equipment_id, team_id, action, actor, at,
      from_location, to_location, delta_qty,
      snapshot_before, snapshot_after
    ) values (
      new.org_id, auth.uid(), new.id, new.team_id, act,
      coalesce(v_actor, new.updated_by, 'system'),
      coalesce(new.updated_at, now()),
      old.location, new.location,
      (coalesce(new.quantity,0) - coalesce(old.quantity,0)),
      to_jsonb(old), to_jsonb(new)
    );
    return new;
  end if;

  if (tg_op = 'DELETE') then
    -- No carrier for the action time of a delete (queued deletes ship only an
    -- id), so deletes are stamped at sync time. Actor is the deleter.
    insert into public.equipment_audit (
      org_id, user_id, equipment_id, team_id, action, actor, from_location, snapshot_before
    ) values (
      old.org_id, auth.uid(), old.id, old.team_id, 'delete',
      coalesce(v_actor, old.updated_by, 'system'),
      old.location,
      to_jsonb(old)
    );
    return old;
  end if;

  return null;
end;
$$;

-- ── 4. Damage / merge RPCs: team-scoped authorisation + team stamp ─────────
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
  v_team uuid;
  v_actor text;
begin
  select e.org_id, e.team_id into v_org, v_team
    from public.equipment_items e where e.id = p_equipment_id;
  if v_org is null then
    raise exception 'equipment not found' using errcode = 'P0002';
  end if;
  -- Same visibility rule as the equipment_items read policies.
  if not (
    public.ghost_can_write(v_org)
    or exists (
      select 1 from public.organization_members om
       where om.org_id = v_org
         and om.user_id = auth.uid()
         and om.status = 'active'
         and (om.role in ('owner', 'admin')
              or not public.org_teams_enabled(v_org)
              or om.team_id = v_team)
    )
  ) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;

  select coalesce(nullif(trim(p.full_name), ''), p.email, 'Unknown')
    into v_actor from public.profiles p where p.id = auth.uid();

  insert into public.equipment_audit (org_id, user_id, equipment_id, team_id, action, actor, at, meta)
  values (
    v_org, auth.uid(), p_equipment_id, v_team, 'damage', coalesce(v_actor, 'Unknown'),
    case when p_at is null or p_at > now() or p_at < now() - interval '30 days'
         then now() else p_at end,
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
  v_team uuid;
  v_actor text;
begin
  -- Resolve org/team from the surviving (destination) row — the source row
  -- may already be deleted by the time a full merge logs.
  select e.org_id, e.team_id into v_org, v_team
    from public.equipment_items e where e.id = p_into;
  if v_org is null then
    raise exception 'equipment not found' using errcode = 'P0002';
  end if;
  if not (
    public.ghost_can_write(v_org)
    or exists (
      select 1 from public.organization_members om
       where om.org_id = v_org
         and om.user_id = auth.uid()
         and om.status = 'active'
         and (om.role in ('owner', 'admin')
              or not public.org_teams_enabled(v_org)
              or om.team_id = v_team)
    )
  ) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;

  select coalesce(nullif(trim(p.full_name), ''), p.email, 'Unknown')
    into v_actor from public.profiles p where p.id = auth.uid();

  insert into public.equipment_audit (
    org_id, user_id, equipment_id, team_id, action, actor, at,
    from_location, to_location, delta_qty, meta
  ) values (
    v_org, auth.uid(), p_into, v_team, 'merge', coalesce(v_actor, 'Unknown'),
    case when p_at is null or p_at > now() or p_at < now() - interval '30 days'
         then now() else p_at end,
    p_from_location, p_to_location, p_qty,
    jsonb_build_object('merged_from_id', p_from, 'merged_into_id', p_into)
  );
end;
$$;

-- ── 5. Audit read policy: one, team-scoped ──────────────────────────────────
drop policy if exists "org members can read audit records" on public.equipment_audit;
drop policy if exists "audit: members read" on public.equipment_audit;
create policy "audit: members read" on public.equipment_audit
  for select to authenticated
  using (
    exists (
      select 1 from public.organization_members om
       where om.org_id = equipment_audit.org_id
         and om.user_id = (select auth.uid())
         and om.status = 'active'
         and (om.role in ('owner', 'admin')
              or not public.org_teams_enabled(equipment_audit.org_id)
              or om.team_id = equipment_audit.team_id)
    )
  );
-- platform_admin_read on equipment_audit is unchanged.
