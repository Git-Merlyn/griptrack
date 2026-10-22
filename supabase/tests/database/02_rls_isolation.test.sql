-- pgTAP: cross-org isolation and role-based writes on equipment_items,
-- equipment_audit, organizations, organization_members, invite_sends.
-- Fixtures are created as postgres and rolled back.
-- Run: supabase test db supabase/tests/database
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- ── fixtures (as postgres) ────────────────────────────────────────────────
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('18000000-0000-0000-0000-0000000000a1', 'wp18-owner-a@test.local', 'authenticated', 'authenticated', '{"full_name":"Owner A"}'),
  ('18000000-0000-0000-0000-0000000000a2', 'wp18-crew-a1@test.local', 'authenticated', 'authenticated', '{"full_name":"Crew A1"}'),
  ('18000000-0000-0000-0000-0000000000a3', 'wp18-head-a2@test.local', 'authenticated', 'authenticated', '{"full_name":"Head A2"}'),
  ('18000000-0000-0000-0000-0000000000b1', 'wp18-owner-b@test.local', 'authenticated', 'authenticated', '{"full_name":"Owner B"}');

insert into public.organizations (id, name, features) values
  ('18000000-0000-0000-0000-00000000000a', 'WP18 Org A', '{"teams_enabled": true, "requests_enabled": false}'),
  ('18000000-0000-0000-0000-00000000000b', 'WP18 Org B', '{"teams_enabled": false, "requests_enabled": false}');

insert into public.teams (id, org_id, name) values
  ('18000000-0000-0000-0000-0000000000c1', '18000000-0000-0000-0000-00000000000a', 'Grip'),
  ('18000000-0000-0000-0000-0000000000c2', '18000000-0000-0000-0000-00000000000a', 'Electric');

insert into public.organization_members (org_id, user_id, role, status, team_id) values
  ('18000000-0000-0000-0000-00000000000a', '18000000-0000-0000-0000-0000000000a1', 'owner', 'active', null),
  ('18000000-0000-0000-0000-00000000000a', '18000000-0000-0000-0000-0000000000a2', 'crew', 'active', '18000000-0000-0000-0000-0000000000c1'),
  ('18000000-0000-0000-0000-00000000000a', '18000000-0000-0000-0000-0000000000a3', 'department_head', 'active', '18000000-0000-0000-0000-0000000000c2'),
  ('18000000-0000-0000-0000-00000000000b', '18000000-0000-0000-0000-0000000000b1', 'owner', 'active', null);

insert into public.equipment_items (id, org_id, team_id, name, location, quantity, updated_by) values
  ('18000000-0000-0000-0000-0000000000e1', '18000000-0000-0000-0000-00000000000a', '18000000-0000-0000-0000-0000000000c1', 'C-stand', 'Truck', 4, 'fixture'),
  ('18000000-0000-0000-0000-0000000000e2', '18000000-0000-0000-0000-00000000000a', '18000000-0000-0000-0000-0000000000c2', 'Skypanel', 'Truck', 2, 'fixture'),
  ('18000000-0000-0000-0000-0000000000e3', '18000000-0000-0000-0000-00000000000b', null, 'Apple box', 'Stage', 8, 'fixture');

insert into public.invite_sends (org_id, user_id, email) values
  ('18000000-0000-0000-0000-00000000000a', '18000000-0000-0000-0000-0000000000a1', 'someone@test.local');

-- Counts rows visible to the current role; a permission error counts as 0
-- (later WPs may turn an RLS-filtered read into a grant-level 42501).
create function pg_temp.visible(p_sql text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || p_sql || ') s' into n;
  return n;
exception when insufficient_privilege then
  return 0;
end $$;
-- Required once WP04 (L66) revokes default EXECUTE from PUBLIC: a pg_temp
-- helper created by postgres is otherwise not callable after the role switch.
-- Harmless before WP04.
grant execute on function pg_temp.visible(text) to public;

-- ── owner of org B: sees nothing of org A ─────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"18000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select is(pg_temp.visible($$select 1 from public.equipment_items where org_id = '18000000-0000-0000-0000-00000000000a'$$),
  0::bigint, 'org B owner sees no org A equipment');
select is(pg_temp.visible($$select 1 from public.equipment_audit where org_id = '18000000-0000-0000-0000-00000000000a'$$),
  0::bigint, 'org B owner sees no org A audit rows');
select is(pg_temp.visible($$select 1 from public.organization_members where org_id = '18000000-0000-0000-0000-00000000000a'$$),
  0::bigint, 'org B owner sees no org A members');
select is_empty(
  $$update public.equipment_items set quantity = 0 where id = '18000000-0000-0000-0000-0000000000e1' returning id$$,
  'org B owner cannot update an org A item (0 rows)');
select throws_ok(
  $$insert into public.equipment_items (org_id, name, location) values ('18000000-0000-0000-0000-00000000000a', 'Planted', 'Truck')$$,
  '42501', null, 'org B owner cannot insert into org A');

-- ── any authenticated user: no direct org or audit inserts ────────────────
select throws_ok(
  $$insert into public.organizations (name) values ('Spam org')$$,
  '42501', null, 'authenticated cannot insert organizations directly');
select throws_ok(
  $$insert into public.equipment_audit (org_id, equipment_id, action, actor) values ('18000000-0000-0000-0000-00000000000b', '18000000-0000-0000-0000-0000000000e3', 'create', 'Forged')$$,
  '42501', null, 'authenticated cannot write audit rows directly');
select is(pg_temp.visible($$select 1 from public.invite_sends$$),
  0::bigint, 'invite_sends is invisible to clients');

-- ── owner of org A: sees both teams ───────────────────────────────────────
set local request.jwt.claims = '{"sub":"18000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is(pg_temp.visible($$select 1 from public.equipment_items$$),
  2::bigint, 'org A owner sees both org A items and nothing else');

-- ── crew in team Grip (teams on): own team only; cannot delete ────────────
set local request.jwt.claims = '{"sub":"18000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select results_eq(
  $$select id from public.equipment_items order by id$$,
  $$values ('18000000-0000-0000-0000-0000000000e1'::uuid)$$,
  'crew sees only their own team''s items');
select is_empty(
  $$delete from public.equipment_items where id = '18000000-0000-0000-0000-0000000000e1' returning id$$,
  'crew cannot delete equipment (0 rows)');

-- ── department head of Electric: cannot insert into another team ──────────
set local request.jwt.claims = '{"sub":"18000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
select throws_ok(
  $$insert into public.equipment_items (org_id, team_id, name, location) values ('18000000-0000-0000-0000-00000000000a', '18000000-0000-0000-0000-0000000000c1', 'Wrong team', 'Truck')$$,
  '42501', null, 'department head cannot insert into another team');

-- ── anon: nothing ─────────────────────────────────────────────────────────
reset request.jwt.claims;
set local role anon;
select is(pg_temp.visible($$select 1 from public.equipment_items$$),
  0::bigint, 'anon sees no equipment');

-- ── back to postgres: the refused writes really did not happen ────────────
reset role;
select results_eq(
  $$select quantity from public.equipment_items where id = '18000000-0000-0000-0000-0000000000e1'$$,
  $$values (4)$$,
  'org A item untouched by the refused update/delete');

select * from finish();
rollback;
