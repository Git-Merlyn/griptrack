-- pgTAP: WP25 sign-up role. handle_new_user stores signup_role from the
-- sign-up metadata; bootstrap_session creates no org for crew (but still
-- accepts their invite); start_own_org creates exactly one org.
-- Run: supabase test db supabase/tests/database
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- ── fixtures (as postgres) ────────────────────────────────────────────────
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('25000000-0000-0000-0000-0000000000a1', 'wp25-owner@test.local',   'authenticated', 'authenticated', '{"full_name":"Owner","signup_role":"owner"}'),
  ('25000000-0000-0000-0000-0000000000c1', 'wp25-crew@test.local',    'authenticated', 'authenticated', '{"full_name":"Crew","signup_role":"crew"}'),
  ('25000000-0000-0000-0000-0000000000c2', 'wp25-invited@test.local', 'authenticated', 'authenticated', '{"full_name":"Invited","signup_role":"crew"}'),
  ('25000000-0000-0000-0000-0000000000b1', 'wp25-legacy@test.local',  'authenticated', 'authenticated', '{"full_name":"Legacy"}'),
  ('25000000-0000-0000-0000-0000000000e1', 'wp25-bogus@test.local',   'authenticated', 'authenticated', '{"full_name":"Bogus","signup_role":"admin"}'),
  ('25000000-0000-0000-0000-0000000000f1', 'wp25-switch@test.local',  'authenticated', 'authenticated', '{"full_name":"Switch","signup_role":"crew"}');

insert into public.organizations (id, name) values
  ('25000000-0000-0000-0000-00000000000a', 'WP25 Org A');
insert into public.organization_members (org_id, user_id, role, status) values
  ('25000000-0000-0000-0000-00000000000a', '25000000-0000-0000-0000-0000000000a1', 'owner', 'active');
insert into public.org_invites (org_id, email, role, status, invited_by) values
  ('25000000-0000-0000-0000-00000000000a', 'wp25-invited@test.local', 'crew', 'pending', '25000000-0000-0000-0000-0000000000a1');

-- ── handle_new_user ───────────────────────────────────────────────────────
select is((select signup_role from public.profiles where id = '25000000-0000-0000-0000-0000000000a1'),
  'owner', 'signup_role owner is stored');
select is((select signup_role from public.profiles where id = '25000000-0000-0000-0000-0000000000c1'),
  'crew', 'signup_role crew is stored');
select is((select signup_role from public.profiles where id = '25000000-0000-0000-0000-0000000000b1'),
  null, 'no signup_role in metadata stores null');
select is((select signup_role from public.profiles where id = '25000000-0000-0000-0000-0000000000e1'),
  null, 'an unknown signup_role value stores null');

-- ── crew with no invite: no org ───────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"25000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

select is((public.bootstrap_session() ->> 'org_id'), null, 'crew with no invite: bootstrap returns no org');
select is((public.bootstrap_session() ->> 'signup_role'), 'crew', 'bootstrap reports signup_role');

reset role;
select is((select count(*) from public.organization_members where user_id = '25000000-0000-0000-0000-0000000000c1'),
  0::bigint, 'crew with no invite: no membership was created');

-- ── crew with a pending invite: joins the inviting org ────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"25000000-0000-0000-0000-0000000000c2","role":"authenticated"}';

select is((public.bootstrap_session() ->> 'org_id'), '25000000-0000-0000-0000-00000000000a',
  'crew with a pending invite: bootstrap lands them in the inviting org');

-- ── legacy account (null role): org created, as before ────────────────────
set local request.jwt.claims = '{"sub":"25000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select isnt((public.bootstrap_session() ->> 'org_id'), null, 'null signup_role: an org is created as before');
select is((public.bootstrap_session() ->> 'role'), 'owner', 'null signup_role: the user owns it');

-- ── start_own_org: crew switches to running a team ────────────────────────
set local request.jwt.claims = '{"sub":"25000000-0000-0000-0000-0000000000f1","role":"authenticated"}';

select is((public.bootstrap_session() ->> 'org_id'), null, 'switching user starts with no org');
select is((select role from public.start_own_org()), 'owner', 'start_own_org creates an org owned by the caller');
select is((select org_id from public.start_own_org()), (public.bootstrap_session() ->> 'org_id')::uuid,
  'start_own_org a second time returns the same org');

reset role;
select is((select count(*) from public.organization_members where user_id = '25000000-0000-0000-0000-0000000000f1'),
  1::bigint, 'start_own_org created exactly one membership');

-- ── grants ────────────────────────────────────────────────────────────────
select ok(not has_function_privilege('anon', 'public.start_own_org()', 'execute'),
  'anon cannot execute start_own_org');

select * from finish();
rollback;
