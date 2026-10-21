-- WP05 — atomic moves (audit H1, M13, L13, L42, L70).
--
-- Problem: an inventory move was 2-3 independent client writes (update +
-- insert, or update + delete). RLS lets crew UPDATE but not INSERT/DELETE, and
-- department heads cannot DELETE, so half the move could be rejected after the
-- other half committed: quantity vanished or was duplicated. Offline, the
-- queued halves were replayed independently with the same hazard.
--
-- Also: increment_equipment_quantity (the offline qty_delta replay RPC used by
-- shipped mobile builds) has always failed with 42702 "column reference
-- item_id is ambiguous" (its parameter shares the name of a column), so every
-- queued offline partial move silently lost its quantity change after 3 retries.
--
-- Design:
--   * move_equipment(...) SECURITY DEFINER: locks the source row, checks the
--     caller may edit it (same rule as the equipment UPDATE policies, plus an
--     armed platform-admin ghost), finds the merge destination server-side,
--     and does relocate / merge / split / split+merge plus the merge audit row
--     in ONE transaction. Every role that may edit a row may move it.
--   * Destinations (D22 option C, Chris 2026-10-21): a destination is a
--     LOCATION. A caller who may not create locations in the item's org
--     (today: crew) may move only to an existing, ACTIVE location of that org;
--     a partial move there may still create the destination equipment row
--     (split). Owner/admin/department_head/armed ghost: unchanged (any name).
--   * Idempotency: an optional p_op_id is recorded in sync_applied_ops in the
--     same transaction; a replay of the same op_id is a no-op that returns
--     {status:'already_applied'}.
--   * increment_equipment_quantity: the 4-arg signature shipped builds call is
--     kept and only its body fixed; a new 5-arg overload takes p_op_id. Both
--     change nothing (no error) for a crew caller: a shipped build queues an
--     offline partial move as "decrement source" + "insert new row", and RLS
--     refuses the crew insert, so applying the decrement alone would destroy
--     the moved units (D22 option C).
--   * L70: moves clamp to the quantity actually present and REPORT it
--     (moved_qty vs requested_qty) instead of silently clamping.
--
-- Backward compatible: no existing signature changes or is dropped.

-- ── 1. Idempotency ledger ────────────────────────────────────────────────────
create table if not exists public.sync_applied_ops (
  op_id      uuid primary key,
  user_id    uuid references auth.users(id) on delete cascade,
  fn         text not null,
  result     jsonb,
  applied_at timestamptz not null default now()
);

comment on table public.sync_applied_ops is
  'Idempotency keys for replayable RPCs (move_equipment, increment_equipment_quantity). Written only by SECURITY DEFINER functions; no client access.';

alter table public.sync_applied_ops enable row level security;
-- Deliberately no policies and no grants: only definer functions touch it.
revoke all on table public.sync_applied_ops from public, anon, authenticated;

create index if not exists sync_applied_ops_user_id_idx on public.sync_applied_ops (user_id);

-- ── 2. Write-permission helper (mirrors the equipment UPDATE policies) ──────
-- "equipment update by role": owner/admin any row in the org; crew and
-- department_head rows of their own team. "equipment update (teams off)":
-- any active member. "platform_admin_write_upd": an armed ghost.
-- Stricter than the policies in one way: the member must be status = 'active'.
create or replace function public.equipment_write_allowed(p_org uuid, p_team uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select p_org is not null and (
    public.ghost_can_write(p_org)
    or exists (
      select 1
      from public.organization_members m
      where m.org_id = p_org
        and m.user_id = auth.uid()
        and m.status = 'active'
        and (
          m.role in ('owner', 'admin')
          or not public.org_teams_enabled(p_org)
          or (m.role in ('department_head', 'crew') and m.team_id = p_team)
        )
    )
  );
$$;

revoke all on function public.equipment_write_allowed(uuid, uuid) from public, anon, authenticated;

-- ── 2b. Location-create helper (mirrors the locations INSERT policies) ──────
-- D22 option C (Chris 2026-10-21): "crew shouldn't be able to create a new
-- destination, but if they are moving to a preset destination that simply
-- does not have those items there, they should be allowed to make that move."
-- Mirrors exactly the policies that let a client INSERT into public.locations:
--   "admins can manage"            (FOR ALL)    owner/admin of the org
--   "dept heads can add locations" (FOR INSERT) department_head of the org
--   "platform_admin_write_ins"     (FOR INSERT) an armed ghost (ghost_can_write)
-- Like those policies it ignores status and team (move_equipment has already
-- required an active member, or an armed ghost, via equipment_write_allowed).
create or replace function public.location_create_allowed(p_org uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select p_org is not null and (
    public.ghost_can_write(p_org)
    or exists (
      select 1
      from public.organization_members m
      where m.org_id = p_org
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'department_head')
    )
  );
$$;

revoke all on function public.location_create_allowed(uuid) from public, anon, authenticated;

-- ── 3. move_equipment ────────────────────────────────────────────────────────
-- p_qty: units to move; NULL = the whole row (bulk "set location").
-- p_op_id: idempotency key (mobile passes one for queued offline moves).
-- p_updated_by: display name stamped on the rows (clients already send this
--   on every write); the merge audit actor is derived server-side.
-- p_at: action time (offline replay); replaced by now() when it is in the
--   future or more than 30 days old (the same backdating rule WP04 gives
--   set_updated_at and the log_*_event RPCs).
-- p_new_id: id to use if a new destination row is created (lets the offline
--   client's optimistic row keep its id after sync).
--
-- Returns jsonb:
--   status        'applied' | 'already_applied'
--   kind          'relocate' | 'merge' | 'split' | 'split_merge' | 'noop'
--   reason        (noop only) 'same_location'
--   requested_qty p_qty (null = whole row)
--   moved_qty     units actually moved (may be < requested_qty if the source
--                 shrank since the client looked)
--   source_id, dest_id
--   source        post-move source row, or null when it was merged away
--   dest          post-move destination row (for 'relocate' = the source row)
-- An 'already_applied' result carries the first call's kind/qty/ids but no rows.
create or replace function public.move_equipment(
  p_source      uuid,
  p_qty         integer,
  p_to_location text,
  p_op_id       uuid        default null,
  p_updated_by  text        default null,
  p_at          timestamptz default null,
  p_new_id      uuid        default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_to       text := nullif(btrim(p_to_location), '');
  v_at       timestamptz := case
                               when p_at is null or p_at > now()
                                 or p_at < now() - interval '30 days' then now()
                               else p_at
                             end;
  v_src      public.equipment_items%rowtype;
  v_dest     public.equipment_items%rowtype;
  v_has_dest boolean;
  v_from     text;
  v_full     boolean;
  v_moved    integer;
  v_kind     text;
  v_by       text;
  v_actor    text;
  v_prev     jsonb;
  v_result   jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_source is null then
    raise exception 'source item is required' using errcode = '22023';
  end if;
  if p_qty is not null and p_qty <= 0 then
    raise exception 'quantity must be greater than 0' using errcode = '22023';
  end if;
  if v_to is null then
    raise exception 'destination location is required' using errcode = '22023';
  end if;

  -- Idempotency: claim the op id first. A concurrent duplicate blocks on the
  -- primary key until this transaction ends, then sees the committed row.
  if p_op_id is not null then
    insert into public.sync_applied_ops (op_id, user_id, fn)
    values (p_op_id, v_uid, 'move_equipment')
    on conflict (op_id) do nothing;
    if not found then
      select o.result into v_prev from public.sync_applied_ops o where o.op_id = p_op_id;
      return coalesce(v_prev, '{}'::jsonb) || jsonb_build_object('status', 'already_applied');
    end if;
  end if;

  select * into v_src from public.equipment_items e where e.id = p_source for update;
  if not found then
    raise exception 'equipment not found' using errcode = 'P0002';
  end if;

  if not public.equipment_write_allowed(v_src.org_id, v_src.team_id) then
    raise exception 'not allowed to move this item' using errcode = '42501';
  end if;

  -- D22 option C: a caller who may not create locations (crew) may move only
  -- to an existing, active location of the item's org. Names are compared
  -- exactly after btrim: locations are unique on (org_id, name), clients store
  -- trimmed names and send the name picked from the location list, and
  -- equipment_items.location is matched exactly (merge lookup below, rename
  -- cascade). A case-folded match would let crew file rows under a spelling
  -- that is not the preset's name. Raised before anything is written, so a
  -- claimed p_op_id is rolled back with it.
  if not public.location_create_allowed(v_src.org_id)
     and not exists (
       select 1
       from public.locations l
       where l.org_id = v_src.org_id
         and l.is_active
         and btrim(l.name) = v_to
     ) then
    raise exception 'destination must be an existing location'
      using errcode = '22023',
            hint = 'Only owners, admins and department heads can add locations.';
  end if;

  v_from := v_src.location;

  if v_from = v_to then
    v_result := jsonb_build_object(
      'kind', 'noop', 'reason', 'same_location',
      'requested_qty', p_qty, 'moved_qty', 0,
      'source_id', v_src.id, 'dest_id', null,
      'source', to_jsonb(v_src), 'dest', null
    );
    if p_op_id is not null then
      update public.sync_applied_ops set result = v_result - 'source' - 'dest' where op_id = p_op_id;
    end if;
    return v_result || jsonb_build_object('status', 'applied');
  end if;

  v_full  := p_qty is null or p_qty >= v_src.quantity;
  v_moved := case when v_full then v_src.quantity else p_qty end;

  select coalesce(nullif(btrim(p.full_name), ''), p.email)
    into v_actor
    from public.profiles p where p.id = v_uid;
  v_actor := coalesce(v_actor, 'Unknown');
  v_by    := coalesce(nullif(btrim(p_updated_by), ''), v_actor);

  -- Merge destination: identical item (same fields the clients' merge check
  -- uses, nulls == '') in the same org AND team at the target location.
  select * into v_dest
    from public.equipment_items d
   where d.org_id = v_src.org_id
     and d.team_id is not distinct from v_src.team_id
     and d.id <> v_src.id
     and d.location = v_to
     and coalesce(d.item_id, '')  = coalesce(v_src.item_id, '')
     and d.name                   = v_src.name
     and coalesce(d.category, '') = coalesce(v_src.category, '')
     and coalesce(d.source, '')   = coalesce(v_src.source, '')
     and d.status                 = v_src.status
     and d.start_date is not distinct from v_src.start_date
     and d.end_date   is not distinct from v_src.end_date
   order by d.created_at, d.id
   limit 1
   for update;
  v_has_dest := found;

  if v_full and v_has_dest then
    -- Whole row onto an identical row: add to destination, remove source.
    update public.equipment_items e
       set quantity = e.quantity + v_moved, updated_by = v_by, updated_at = v_at
     where e.id = v_dest.id
    returning * into v_dest;
    v_kind := 'merge';

  elsif v_full then
    -- Whole row, nothing to merge into: relocate in place.
    update public.equipment_items e
       set location = v_to, updated_by = v_by, updated_at = v_at
     where e.id = v_src.id
    returning * into v_src;
    v_dest := v_src;
    v_kind := 'relocate';

  else
    -- Partial: decrement the source first ...
    update public.equipment_items e
       set quantity = e.quantity - v_moved, updated_by = v_by, updated_at = v_at
     where e.id = v_src.id
    returning * into v_src;

    if v_has_dest then
      -- ... then add to the identical destination row
      update public.equipment_items e
         set quantity = e.quantity + v_moved, updated_by = v_by, updated_at = v_at
       where e.id = v_dest.id
      returning * into v_dest;
      v_kind := 'split_merge';
    else
      -- ... or create the destination row as a copy of the source.
      insert into public.equipment_items (
        id, org_id, team_id, production_id, item_id, name, category, source,
        quantity, reserve_min, location, status, start_date, end_date,
        updated_by, updated_at
      ) values (
        coalesce(p_new_id, gen_random_uuid()), v_src.org_id, v_src.team_id,
        v_src.production_id, v_src.item_id, v_src.name, v_src.category,
        v_src.source, v_moved, v_src.reserve_min, v_to, v_src.status,
        v_src.start_date, v_src.end_date, v_by, v_at
      )
      returning * into v_dest;
      v_kind := 'split';
    end if;
  end if;

  if v_kind in ('merge', 'split_merge') then
    -- The trigger can't know two rows were combined; record it explicitly
    -- (same shape log_merge_event writes). Written before the source delete.
    insert into public.equipment_audit (
      org_id, user_id, equipment_id, team_id, action, actor, at,
      from_location, to_location, delta_qty, meta
    ) values (
      v_src.org_id, v_uid, v_dest.id, v_src.team_id, 'merge', v_actor, v_at,
      v_from, v_to, v_moved,
      jsonb_build_object('merged_from_id', v_src.id, 'merged_into_id', v_dest.id)
    );
  end if;

  if v_kind = 'merge' then
    delete from public.equipment_items e where e.id = v_src.id;
  end if;

  v_result := jsonb_build_object(
    'kind', v_kind,
    'requested_qty', p_qty,
    'moved_qty', v_moved,
    'source_id', p_source,
    'dest_id', v_dest.id,
    'source', case when v_kind = 'merge' then null else to_jsonb(v_src) end,
    'dest', to_jsonb(v_dest)
  );

  if p_op_id is not null then
    update public.sync_applied_ops set result = v_result - 'source' - 'dest' where op_id = p_op_id;
  end if;

  return v_result || jsonb_build_object('status', 'applied');
end;
$$;

revoke all on function public.move_equipment(uuid, integer, text, uuid, text, timestamptz, uuid) from public, anon;
grant execute on function public.move_equipment(uuid, integer, text, uuid, text, timestamptz, uuid) to authenticated;

-- ── 4. increment_equipment_quantity ──────────────────────────────────────────
-- 4-arg (shipped mobile builds): same signature, same SECURITY INVOKER + RLS
-- semantics (no RLS widening), body fixed so the WHERE clause no longer hits
-- 42702.
-- D22 option C (Chris 2026-10-21): a no-op (no error) for a crew caller. A
-- shipped build queues an offline partial move as this decrement plus an
-- "insert new row" at the destination; RLS refuses the crew insert, so a
-- working decrement would destroy the moved units. Crew offline partial moves
-- (and crew merge-type pairs: two deltas) therefore stay no-ops, exactly as
-- before this fix, until testers install a build that moves via
-- move_equipment. Owner/admin/department_head calls are applied. An armed
-- platform-admin ghost may insert rows, so it is never treated as crew.
create or replace function public.increment_equipment_quantity(
  item_id uuid,
  delta integer,
  updated_by_val text,
  updated_at_val timestamptz
) returns void
  language plpgsql
  set search_path = public
as $$
declare
  v_org uuid;
begin
  -- Runs as the caller: RLS decides which rows are visible / updatable.
  select e.org_id into v_org
    from public.equipment_items as e
   where e.id = increment_equipment_quantity.item_id;
  if v_org is null then
    return; -- not visible to the caller: the UPDATE would change nothing either
  end if;

  if exists (
       select 1
       from public.organization_members as m
       where m.org_id = v_org
         and m.user_id = (select auth.uid())
         and m.role = 'crew'
     )
     and not public.ghost_can_write(v_org) then
    return; -- crew: see header (D22 option C)
  end if;

  update public.equipment_items as e
     set quantity   = greatest(0, e.quantity + increment_equipment_quantity.delta),
         updated_by = increment_equipment_quantity.updated_by_val,
         updated_at = increment_equipment_quantity.updated_at_val
   where e.id = increment_equipment_quantity.item_id;
end;
$$;

-- 5-arg overload (new builds): idempotent via p_op_id. No default on p_op_id,
-- so 4-arg calls stay unambiguous. SECURITY DEFINER because it writes the
-- ledger; authorisation is the same helper move_equipment uses. Same crew
-- no-op as the 4-arg body (D22 option C): only legacy queue entries reach it,
-- and a legacy crew partial move's paired insert is refused by RLS.
create or replace function public.increment_equipment_quantity(
  item_id uuid,
  delta integer,
  updated_by_val text,
  updated_at_val timestamptz,
  p_op_id uuid
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_org  uuid;
  v_team uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_op_id is not null then
    insert into public.sync_applied_ops (op_id, user_id, fn)
    values (p_op_id, auth.uid(), 'increment_equipment_quantity')
    on conflict (op_id) do nothing;
    if not found then
      return; -- already applied by an earlier attempt
    end if;
  end if;

  select e.org_id, e.team_id into v_org, v_team
    from public.equipment_items e
   where e.id = increment_equipment_quantity.item_id
   for update;
  if not found then
    raise exception 'equipment not found' using errcode = 'P0002';
  end if;

  if not public.equipment_write_allowed(v_org, v_team) then
    raise exception 'not allowed to change this item' using errcode = '42501';
  end if;

  if exists (
       select 1
       from public.organization_members as m
       where m.org_id = v_org
         and m.user_id = auth.uid()
         and m.role = 'crew'
     )
     and not public.ghost_can_write(v_org) then
    return; -- crew: no-op, see the 4-arg header (op id stays claimed; a replay is a no-op too)
  end if;

  update public.equipment_items as e
     set quantity   = greatest(0, e.quantity + increment_equipment_quantity.delta),
         updated_by = increment_equipment_quantity.updated_by_val,
         updated_at = increment_equipment_quantity.updated_at_val
   where e.id = increment_equipment_quantity.item_id;
end;
$$;

revoke all on function public.increment_equipment_quantity(uuid, integer, text, timestamptz, uuid) from public, anon;
grant execute on function public.increment_equipment_quantity(uuid, integer, text, timestamptz, uuid) to authenticated;

-- Make PostgREST see the new functions/overload immediately.
notify pgrst, 'reload schema';
