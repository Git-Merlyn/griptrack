-- supabase/behavior-tests/wp05_move_equipment.sql
-- WP05 behavior tests for move_equipment / increment_equipment_quantity.
-- Not pgTAP (deliberately outside supabase/tests/, which `supabase test db` feeds to pg_prove).
-- Requires migration 20261021050000_move_equipment_rpc.sql to be applied (supabase migration up).
-- Run from the repo root:
--   docker exec -i supabase_db_griptrack psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -q \
--     < supabase/behavior-tests/wp05_move_equipment.sql
-- Everything runs inside BEGIN ... ROLLBACK; nothing persists. Any failure aborts with "FAIL: <label>".
\set ON_ERROR_STOP 1
\set QUIET 1
begin;

-- ── helpers ──────────────────────────────────────────────────────────────────
create function pg_temp.ok(cond boolean, label text) returns text
  language plpgsql as $$
begin
  if cond is distinct from true then
    raise exception 'FAIL: %', label;
  end if;
  return 'ok: ' || label;
end $$;

create function pg_temp.act_as(uid uuid) returns void
  language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.qty(eid uuid) returns int
  language sql as $$ select quantity from public.equipment_items where id = eid $$;

-- ── fixtures (as postgres) ───────────────────────────────────────────────────
-- users: owner, admin, dept head (T1), crew (T1), crew (T2), outsider, teams-off crew,
-- disabled crew (T1; only before WP04, see below), platform admins (armed ghost and unarmed ghost on Teams Org)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a001', 'owner@wp05.test'),
  ('00000000-0000-0000-0000-00000000a002', 'admin@wp05.test'),
  ('00000000-0000-0000-0000-00000000a003', 'dh@wp05.test'),
  ('00000000-0000-0000-0000-00000000a004', 'crew1@wp05.test'),
  ('00000000-0000-0000-0000-00000000a005', 'crew2@wp05.test'),
  ('00000000-0000-0000-0000-00000000a006', 'outsider@wp05.test'),
  ('00000000-0000-0000-0000-00000000a007', 'flatcrew@wp05.test'),
  ('00000000-0000-0000-0000-00000000a008', 'disabled@wp05.test'),
  ('00000000-0000-0000-0000-00000000a009', 'ghost@wp05.test'),
  ('00000000-0000-0000-0000-00000000a010', 'roghost@wp05.test');

insert into public.organizations (id, name, features) values
  ('00000000-0000-0000-0000-00000000b001', 'Teams Org', '{"teams_enabled": true,  "requests_enabled": false}'),
  ('00000000-0000-0000-0000-00000000b002', 'Other Org', '{"teams_enabled": true,  "requests_enabled": false}'),
  ('00000000-0000-0000-0000-00000000b003', 'Flat Org',  '{"teams_enabled": false, "requests_enabled": false}');

-- Paid plan for every fixture org (on_org_created made a 'free' row), so plan
-- limits (WP09 Option A: Free = 50 items, 1 active location, owner only) never
-- interfere with these move tests, whether or not WP09 has landed.
update public.subscriptions set plan = 'team', status = 'active'
 where org_id in ('00000000-0000-0000-0000-00000000b001',
                  '00000000-0000-0000-0000-00000000b002',
                  '00000000-0000-0000-0000-00000000b003');

insert into public.teams (id, org_id, name) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000b001', 'Grip'),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000b001', 'Electric');

insert into public.organization_members (org_id, user_id, role, status, team_id) values
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000a001', 'owner',           'active',   null),
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000a002', 'admin',           'active',   null),
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000a003', 'department_head', 'active',   '00000000-0000-0000-0000-00000000c001'),
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000a004', 'crew',            'active',   '00000000-0000-0000-0000-00000000c001'),
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000a005', 'crew',            'active',   '00000000-0000-0000-0000-00000000c002'),
  ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-00000000a006', 'owner',           'active',   null),
  ('00000000-0000-0000-0000-00000000b003', '00000000-0000-0000-0000-00000000a007', 'crew',            'active',   null);

-- Disabled member: only while the status CHECK still allows 'disabled'.
-- WP04 (L58) restricts status to 'active', after which a disabled member
-- cannot exist and the "disabled member" check below is skipped.
do $$
begin
  insert into public.organization_members (org_id, user_id, role, status, team_id) values
    ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000a008', 'crew', 'disabled', '00000000-0000-0000-0000-00000000c001');
exception when check_violation then
  null;
end $$;

-- Armed platform-admin ghost on Teams Org (not a member), and an UNARMED
-- (read-only) ghost viewing Teams Org (can SELECT its rows, cannot write).
insert into public.platform_admins (user_id) values
  ('00000000-0000-0000-0000-00000000a009'),
  ('00000000-0000-0000-0000-00000000a010');
insert into public.platform_admin_state (user_id, active_org_id, write_enabled, write_expires_at) values
  ('00000000-0000-0000-0000-00000000a009', '00000000-0000-0000-0000-00000000b001', true,  now() + interval '1 hour'),
  ('00000000-0000-0000-0000-00000000a010', '00000000-0000-0000-0000-00000000b001', false, null);

-- Preset locations (D22 option C: crew may move only to these).
-- Teams Org: Truck 1, Truck 2, Stage A, Stage C active; Old Shed inactive.
-- 'Stage B', 'Stage Z', 'Ghost Bay', 'Nowhere' deliberately do not exist.
-- Other Org: Annex. Flat Org: Truck 1, Truck 9.
insert into public.locations (org_id, name, is_active) values
  ('00000000-0000-0000-0000-00000000b001', 'Truck 1',  true),
  ('00000000-0000-0000-0000-00000000b001', 'Truck 2',  true),
  ('00000000-0000-0000-0000-00000000b001', 'Stage A',  true),
  ('00000000-0000-0000-0000-00000000b001', 'Stage C',  true),
  ('00000000-0000-0000-0000-00000000b001', 'Old Shed', false),
  ('00000000-0000-0000-0000-00000000b002', 'Annex',    true),
  ('00000000-0000-0000-0000-00000000b003', 'Truck 1',  true),
  ('00000000-0000-0000-0000-00000000b003', 'Truck 9',  true);

-- equipment (all Grip team unless noted)
insert into public.equipment_items (id, org_id, team_id, name, category, source, location, quantity, status) values
  -- e1: crew partial split source
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000c001', 'C-Stand',   'Grip', 'House', 'Truck 1', 5, 'Available'),
  -- e2/e3: crew full merge (e2 -> e3)
  ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000c001', 'Apple Box', 'Grip', 'House', 'Truck 1', 4, 'Available'),
  ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000c001', 'Apple Box', 'Grip', 'House', 'Stage A', 6, 'Available'),
  -- e4/e5: dept head partial merge (e4 -> e5)
  ('00000000-0000-0000-0000-00000000e004', '00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000c001', 'Sandbag',   'Grip', 'House', 'Truck 1', 10, 'Available'),
  ('00000000-0000-0000-0000-00000000e005', '00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000c001', 'Sandbag',   'Grip', 'House', 'Stage A', 2, 'Available'),
  -- e6: Electric team row (admin relocate; crew1 must be denied)
  ('00000000-0000-0000-0000-00000000e006', '00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000c002', 'Stinger',   'Electric', 'House', 'Truck 2', 3, 'Available'),
  -- e7: same name as e3 but different status -> must NOT merge
  ('00000000-0000-0000-0000-00000000e007', '00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000c001', 'Apple Box', 'Grip', 'House', 'Truck 1', 1, 'Damaged'),
  -- e8: other org
  ('00000000-0000-0000-0000-00000000e008', '00000000-0000-0000-0000-00000000b002', null, 'Flag',  'Grip', 'House', 'Truck 1', 2, 'Available'),
  -- e9: flat (teams off) org
  ('00000000-0000-0000-0000-00000000e009', '00000000-0000-0000-0000-00000000b003', null, 'Combo', 'Grip', 'House', 'Truck 1', 4, 'Available'),
  -- e10: replay source; e11: increment target; e12: qty-0 row for whole-row move
  ('00000000-0000-0000-0000-00000000e010', '00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000c001', 'Cutter',  'Grip', 'House', 'Truck 1', 8, 'Available'),
  ('00000000-0000-0000-0000-00000000e011', '00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000c001', 'Mafer',   'Grip', 'House', 'Truck 1', 5, 'Available'),
  ('00000000-0000-0000-0000-00000000e012', '00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000c001', 'Wedge',   'Grip', 'House', 'Truck 1', 0, 'Available'),
  -- e13: admin / armed-ghost splits (D22 option C)
  ('00000000-0000-0000-0000-00000000e013', '00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000c001', 'Gobo',    'Grip', 'House', 'Truck 1', 4, 'Available');

-- ── 1. crew: partial move to an EXISTING location with no matching row -> split
-- (D22 option C: allowed although crew cannot insert equipment rows or locations)
select pg_temp.act_as('00000000-0000-0000-0000-00000000a004');
create temp table r1 as
  select public.move_equipment('00000000-0000-0000-0000-00000000e001', 2, 'Truck 2',
           null, 'crew1', null, '00000000-0000-0000-0000-00000000f001') as r;
reset role;
select pg_temp.ok((select r->>'kind' from r1) = 'split', 'crew partial to existing location -> split');
select pg_temp.ok((select (r->>'moved_qty')::int from r1) = 2, 'crew partial moved_qty = 2');
select pg_temp.ok(pg_temp.qty('00000000-0000-0000-0000-00000000e001') = 3, 'crew partial source 5 -> 3');
select pg_temp.ok((select quantity = 2 and location = 'Truck 2' and team_id = '00000000-0000-0000-0000-00000000c001'
                     from public.equipment_items where id = '00000000-0000-0000-0000-00000000f001'),
                  'crew partial created row with p_new_id, qty 2, same team');
select pg_temp.ok((select (r->'dest'->>'id') from r1) = '00000000-0000-0000-0000-00000000f001', 'split result carries dest row');

-- ── 2. crew: full move onto identical row -> merge + delete + audit ──────────
select pg_temp.act_as('00000000-0000-0000-0000-00000000a004');
create temp table r2 as
  -- p_at more than 30 days old -> the move is stamped now()
  select public.move_equipment('00000000-0000-0000-0000-00000000e002', 4, 'Stage A',
           null, null, now() - interval '1 year') as r;
reset role;
select pg_temp.ok((select r->>'kind' from r2) = 'merge', 'crew full -> merge');
select pg_temp.ok((select r->'source' from r2) = 'null'::jsonb, 'merge result source is null');
select pg_temp.ok(pg_temp.qty('00000000-0000-0000-0000-00000000e003') = 10, 'merge dest 6 -> 10');
select pg_temp.ok(not exists (select 1 from public.equipment_items where id = '00000000-0000-0000-0000-00000000e002'), 'merge source deleted');
select pg_temp.ok(pg_temp.qty('00000000-0000-0000-0000-00000000e007') = 1, 'non-identical (Damaged) row untouched');
select pg_temp.ok((select count(*) = 1 from public.equipment_audit
                    where action = 'merge' and equipment_id = '00000000-0000-0000-0000-00000000e003'
                      and meta->>'merged_from_id' = '00000000-0000-0000-0000-00000000e002'
                      and delta_qty = 4 and actor = 'crew1@wp05.test'
                      and user_id = '00000000-0000-0000-0000-00000000a004'
                      and at = now()),
                  'merge audit row written with server-derived actor, old p_at stamped now()');

-- ── 3. dept head: partial move onto identical row -> split_merge ─────────────
select pg_temp.act_as('00000000-0000-0000-0000-00000000a003');
create temp table r3 as
  select public.move_equipment('00000000-0000-0000-0000-00000000e004', 3, 'Stage A') as r;
reset role;
select pg_temp.ok((select r->>'kind' from r3) = 'split_merge', 'dept head partial -> split_merge');
select pg_temp.ok(pg_temp.qty('00000000-0000-0000-0000-00000000e004') = 7, 'split_merge source 10 -> 7');
select pg_temp.ok(pg_temp.qty('00000000-0000-0000-0000-00000000e005') = 5, 'split_merge dest 2 -> 5');
select pg_temp.ok((select count(*) = 1 from public.equipment_audit
                    where action = 'merge' and equipment_id = '00000000-0000-0000-0000-00000000e005'),
                  'split_merge audit row written');

-- ── 4. admin: full move of another team's row, no dest -> relocate ───────────
select pg_temp.act_as('00000000-0000-0000-0000-00000000a002');
create temp table r4 as
  select public.move_equipment('00000000-0000-0000-0000-00000000e006', null, 'Stage B') as r;
reset role;
select pg_temp.ok((select r->>'kind' from r4) = 'relocate', 'admin whole-row -> relocate');
select pg_temp.ok((select location from public.equipment_items where id = '00000000-0000-0000-0000-00000000e006') = 'Stage B', 'relocate changed location');
select pg_temp.ok((select count(*) = 1 from public.equipment_audit
                    where action = 'move' and equipment_id = '00000000-0000-0000-0000-00000000e006'),
                  'relocate logged one trigger move row');
select pg_temp.ok(not exists (select 1 from public.locations where name = 'Stage B'),
                  'admin move to a brand-new name allowed (unchanged) and creates no locations row');

-- ── 4b. D22 option C: roles that may create locations are unchanged ─────────
-- admin, partial move to an existing location -> split
select pg_temp.act_as('00000000-0000-0000-0000-00000000a002');
create temp table r4b as
  select public.move_equipment('00000000-0000-0000-0000-00000000e013', 2, 'Stage C') as r;
reset role;
select pg_temp.ok((select r->>'kind' from r4b) = 'split' and pg_temp.qty('00000000-0000-0000-0000-00000000e013') = 2,
                  'admin partial to existing location -> split (4 -> 2)');
-- department head, partial move to a brand-new name -> split (dept heads may add locations)
select pg_temp.act_as('00000000-0000-0000-0000-00000000a003');
create temp table r4c as
  select public.move_equipment('00000000-0000-0000-0000-00000000e004', 1, 'Stage Z') as r;
reset role;
select pg_temp.ok((select r->>'kind' from r4c) = 'split' and pg_temp.qty('00000000-0000-0000-0000-00000000e004') = 6,
                  'dept head partial to a brand-new name -> split (7 -> 6)');
-- armed platform-admin ghost (not a member), partial move to a brand-new name -> split
select pg_temp.act_as('00000000-0000-0000-0000-00000000a009');
create temp table r4d as
  select public.move_equipment('00000000-0000-0000-0000-00000000e013', 1, 'Ghost Bay') as r;
reset role;
select pg_temp.ok((select r->>'kind' from r4d) = 'split' and pg_temp.qty('00000000-0000-0000-0000-00000000e013') = 1,
                  'armed ghost partial to a brand-new name -> split (2 -> 1)');

-- ── 5. replay of the same op_id is a no-op ───────────────────────────────────
select pg_temp.act_as('00000000-0000-0000-0000-00000000a004');
create temp table r5a as
  select public.move_equipment('00000000-0000-0000-0000-00000000e010', 3, 'Truck 2',
           '00000000-0000-0000-0000-0000000000d1', 'crew1', now() - interval '2 days') as r;
create temp table r5b as
  select public.move_equipment('00000000-0000-0000-0000-00000000e010', 3, 'Truck 2',
           '00000000-0000-0000-0000-0000000000d1', 'crew1', now() - interval '2 days') as r;
reset role;
select pg_temp.ok((select r->>'status' from r5a) = 'applied', 'first call applied');
select pg_temp.ok((select r->>'status' from r5b) = 'already_applied', 'replay -> already_applied');
select pg_temp.ok((select r->>'kind' from r5b) = 'split', 'replay echoes first kind');
select pg_temp.ok(pg_temp.qty('00000000-0000-0000-0000-00000000e010') = 5, 'replay did not decrement twice (8 -> 5)');
select pg_temp.ok((select count(*) = 1 from public.equipment_items where name = 'Cutter' and location = 'Truck 2'),
                  'replay did not insert a second destination row');
select pg_temp.ok((select updated_at = now() - interval '2 days' from public.equipment_items
                    where id = '00000000-0000-0000-0000-00000000e010'), 'p_at kept as action time');

-- ── 6. clamp: request more than present -> whole row, moved_qty reported ─────
select pg_temp.act_as('00000000-0000-0000-0000-00000000a004');
create temp table r6 as
  select public.move_equipment('00000000-0000-0000-0000-00000000e001', 50, 'Stage C') as r;
reset role;
select pg_temp.ok((select (r->>'moved_qty')::int = 3 and (r->>'requested_qty')::int = 50 from r6),
                  'over-request clamps: moved 3 of 50');
select pg_temp.ok((select r->>'kind' from r6) = 'relocate', 'clamped move is a whole-row relocate');

-- ── 7. whole-row move of a qty-0 row works (bulk set location) ───────────────
select pg_temp.act_as('00000000-0000-0000-0000-00000000a004');
create temp table r7 as
  select public.move_equipment('00000000-0000-0000-0000-00000000e012', null, 'Stage C') as r;
reset role;
select pg_temp.ok((select r->>'kind' from r7) = 'relocate', 'qty-0 whole-row move relocates');

-- ── 8. same location -> noop ─────────────────────────────────────────────────
select pg_temp.act_as('00000000-0000-0000-0000-00000000a004');
create temp table r8 as
  select public.move_equipment('00000000-0000-0000-0000-00000000e011', 1, 'Truck 1') as r;
reset role;
select pg_temp.ok((select r->>'kind' = 'noop' and r->>'reason' = 'same_location' from r8), 'same location -> noop');
select pg_temp.ok(pg_temp.qty('00000000-0000-0000-0000-00000000e011') = 5, 'noop changed nothing');

-- ── 9. teams-off org: crew may move ──────────────────────────────────────────
select pg_temp.act_as('00000000-0000-0000-0000-00000000a007');
create temp table r9 as
  select public.move_equipment('00000000-0000-0000-0000-00000000e009', 1, 'Truck 9') as r;
reset role;
select pg_temp.ok((select r->>'kind' from r9) = 'split', 'teams-off crew partial to existing location -> split');

-- ── 10. rejections ───────────────────────────────────────────────────────────
select pg_temp.act_as('00000000-0000-0000-0000-00000000a005'); -- crew of Electric
do $$ begin
  perform public.move_equipment('00000000-0000-0000-0000-00000000e011', 1, 'Truck 2');
  raise exception 'FAIL: cross-team move was allowed';
exception when insufficient_privilege then raise notice 'ok: cross-team crew denied (42501)';
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a006'); -- owner of another org
do $$ begin
  perform public.move_equipment('00000000-0000-0000-0000-00000000e011', 1, 'Truck 2');
  raise exception 'FAIL: cross-org move was allowed';
exception when insufficient_privilege then raise notice 'ok: cross-org owner denied (42501)';
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a008'); -- disabled crew of Grip (before WP04 only)
do $$ begin
  if not exists (select 1 from public.organization_members
                  where user_id = '00000000-0000-0000-0000-00000000a008') then
    raise notice 'ok: disabled member check skipped (WP04 L58: no disabled members)';
    return;
  end if;
  begin
    perform public.move_equipment('00000000-0000-0000-0000-00000000e011', 1, 'Truck 2');
    raise exception 'FAIL: disabled member move was allowed';
  exception when insufficient_privilege then raise notice 'ok: disabled member denied (42501)';
  end;
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a010'); -- unarmed (read-only) ghost
do $$ begin
  perform public.move_equipment('00000000-0000-0000-0000-00000000e011', 1, 'Truck 2');
  raise exception 'FAIL: unarmed ghost move was allowed';
exception when insufficient_privilege then raise notice 'ok: unarmed ghost denied (42501)';
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a004');
do $$ begin
  perform public.move_equipment('00000000-0000-0000-0000-00000000e011', 0, 'Truck 2');
  raise exception 'FAIL: qty 0 accepted';
exception when invalid_parameter_value then raise notice 'ok: qty 0 rejected (22023)';
end $$;
do $$ begin
  perform public.move_equipment('00000000-0000-0000-0000-0000000000ff', 1, 'Truck 2');
  raise exception 'FAIL: missing source accepted';
exception when no_data_found then raise notice 'ok: missing source -> P0002';
end $$;

-- D22 option C: crew may not move to a location that does not exist
do $$ begin
  perform public.move_equipment('00000000-0000-0000-0000-00000000e011', 2, 'Nowhere',
            '00000000-0000-0000-0000-0000000000d5');
  raise exception 'FAIL: crew move to a non-existent location was allowed';
exception when invalid_parameter_value then
  if sqlerrm <> 'destination must be an existing location' then raise; end if;
  raise notice 'ok: crew partial to non-existent location rejected (22023)';
end $$;
do $$ begin
  perform public.move_equipment('00000000-0000-0000-0000-00000000e011', null, 'Nowhere');
  raise exception 'FAIL: crew whole-row move to a non-existent location was allowed';
exception when invalid_parameter_value then raise notice 'ok: crew whole-row to non-existent location rejected (22023)';
end $$;
do $$ begin
  perform public.move_equipment('00000000-0000-0000-0000-00000000e011', 2, 'Old Shed');
  raise exception 'FAIL: crew move to an inactive location was allowed';
exception when invalid_parameter_value then raise notice 'ok: crew move to inactive location rejected (22023)';
end $$;
do $$ begin
  perform public.move_equipment('00000000-0000-0000-0000-00000000e011', 2, 'Annex');
  raise exception 'FAIL: crew move to another org''s location was allowed';
exception when invalid_parameter_value then raise notice 'ok: crew move to another org''s location rejected (22023)';
end $$;
do $$ begin
  perform public.move_equipment('00000000-0000-0000-0000-00000000e011', 2, 'truck 2');
  raise exception 'FAIL: crew move to a differently-cased name was allowed';
exception when invalid_parameter_value then raise notice 'ok: crew location match is exact (case-sensitive) (22023)';
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a007'); -- teams-off crew
do $$ begin
  perform public.move_equipment('00000000-0000-0000-0000-00000000e009', 1, 'Truck 99');
  raise exception 'FAIL: teams-off crew move to a non-existent location was allowed';
exception when invalid_parameter_value then raise notice 'ok: teams-off crew to non-existent location rejected (22023)';
end $$;
reset role;

select pg_temp.ok(pg_temp.qty('00000000-0000-0000-0000-00000000e011') = 5, 'rejected moves changed nothing');
select pg_temp.ok(pg_temp.qty('00000000-0000-0000-0000-00000000e009') = 3, 'rejected teams-off move changed nothing');
select pg_temp.ok(not exists (select 1 from public.equipment_items
                               where location in ('Nowhere', 'Old Shed', 'Annex', 'truck 2', 'Truck 99')),
                  'rejected crew moves created no rows');
select pg_temp.ok(not exists (select 1 from public.sync_applied_ops
                               where op_id = '00000000-0000-0000-0000-0000000000d5'),
                  'rejected move did not keep its op id (a fixed retry can still apply)');

set local role anon;
do $$ begin
  perform public.move_equipment('00000000-0000-0000-0000-00000000e011', 1, 'Truck 2');
  raise exception 'FAIL: anon could execute move_equipment';
exception when insufficient_privilege then raise notice 'ok: anon has no EXECUTE';
end $$;
reset role;

-- ── 11. increment_equipment_quantity ─────────────────────────────────────────
-- 4-arg (shipped builds), D22 option C: crew -> no-op without error
select pg_temp.act_as('00000000-0000-0000-0000-00000000a004');
select public.increment_equipment_quantity('00000000-0000-0000-0000-00000000e011', -2, 'crew1', now());
reset role;
select pg_temp.ok(pg_temp.qty('00000000-0000-0000-0000-00000000e011') = 5, '4-arg crew call: no error, quantity unchanged (5)');
select pg_temp.act_as('00000000-0000-0000-0000-00000000a007'); -- teams-off crew
select public.increment_equipment_quantity('00000000-0000-0000-0000-00000000e009', -1, 'flatcrew', now());
reset role;
select pg_temp.ok(pg_temp.qty('00000000-0000-0000-0000-00000000e009') = 3, '4-arg teams-off crew call: quantity unchanged (3)');
-- 4-arg, unarmed ghost: not crew, so it reaches the UPDATE, which RLS refuses (0 rows, no error)
select pg_temp.act_as('00000000-0000-0000-0000-00000000a010');
select public.increment_equipment_quantity('00000000-0000-0000-0000-00000000e011', -2, 'roghost', now());
reset role;
select pg_temp.ok(pg_temp.qty('00000000-0000-0000-0000-00000000e011') = 5, '4-arg unarmed ghost call: quantity unchanged (5)');

-- 4-arg: department head and admin -> applied (42702 fixed)
select pg_temp.act_as('00000000-0000-0000-0000-00000000a003');
select public.increment_equipment_quantity('00000000-0000-0000-0000-00000000e011', -2, 'dh', now());
reset role;
select pg_temp.ok(pg_temp.qty('00000000-0000-0000-0000-00000000e011') = 3, '4-arg dept head call applied (5 -> 3)');
-- WP04 hand-off: once WP04's trigger derives the audit actor server-side
-- (detected by equipment_audit.team_id), the increment's audit row must name
-- the caller's profile, not updated_by_val. Before WP04 this check is skipped.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'equipment_audit'
                and column_name = 'team_id') then
    if not exists (select 1 from public.equipment_audit
                    where equipment_id = '00000000-0000-0000-0000-00000000e011'
                      and action = 'update' and delta_qty = -2
                      and actor = 'dh@wp05.test') then
      raise exception 'FAIL: increment audit actor is not the caller''s profile (WP04 trigger)';
    end if;
    raise notice 'ok: increment audit actor = caller profile (WP04 landed)';
  else
    raise notice 'ok: increment audit actor check skipped (WP04 not landed)';
  end if;
end $$;
select pg_temp.act_as('00000000-0000-0000-0000-00000000a002');
select public.increment_equipment_quantity('00000000-0000-0000-0000-00000000e011', 1, 'admin', now());
reset role;
select pg_temp.ok(pg_temp.qty('00000000-0000-0000-0000-00000000e011') = 4, '4-arg admin call applied (3 -> 4)');

-- 5-arg, D22 option C: crew -> no-op without error
select pg_temp.act_as('00000000-0000-0000-0000-00000000a004');
select public.increment_equipment_quantity('00000000-0000-0000-0000-00000000e011', 4, 'crew1', now(), '00000000-0000-0000-0000-0000000000d2');
reset role;
select pg_temp.ok(pg_temp.qty('00000000-0000-0000-0000-00000000e011') = 4, '5-arg crew call: no error, quantity unchanged (4)');

-- 5-arg: admin replay of the same op id is applied once
select pg_temp.act_as('00000000-0000-0000-0000-00000000a002');
select public.increment_equipment_quantity('00000000-0000-0000-0000-00000000e011', 4, 'admin', now(), '00000000-0000-0000-0000-0000000000d4');
select public.increment_equipment_quantity('00000000-0000-0000-0000-00000000e011', 4, 'admin', now(), '00000000-0000-0000-0000-0000000000d4');
reset role;
select pg_temp.ok(pg_temp.qty('00000000-0000-0000-0000-00000000e011') = 8, '5-arg admin replay applied once (4 -> 8)');

-- 5-arg: cross-team denied
select pg_temp.act_as('00000000-0000-0000-0000-00000000a005');
do $$ begin
  perform public.increment_equipment_quantity('00000000-0000-0000-0000-00000000e011', 1, 'x', now(), '00000000-0000-0000-0000-0000000000d3');
  raise exception 'FAIL: cross-team increment allowed';
exception when insufficient_privilege then raise notice 'ok: cross-team 5-arg increment denied (42501)';
end $$;
reset role;

-- ledger is invisible to clients
select pg_temp.act_as('00000000-0000-0000-0000-00000000a004');
do $$ begin
  perform 1 from public.sync_applied_ops;
  raise exception 'FAIL: authenticated can read sync_applied_ops';
exception when insufficient_privilege then raise notice 'ok: sync_applied_ops not readable by clients';
end $$;
reset role;

select 'ALL WP05 BEHAVIOR TESTS PASSED' as result;
rollback;
