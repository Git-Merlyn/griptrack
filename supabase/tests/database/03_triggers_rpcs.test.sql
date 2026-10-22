-- pgTAP: audit trigger, set_updated_at action-time rules, damage RPC
-- membership check, beta_feedback org stamping, bootstrap_session (new org
-- and invite acceptance), ghost read-only vs armed write.
-- Run: supabase test db supabase/tests/database
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- ── fixtures (as postgres) ────────────────────────────────────────────────
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('18000000-0000-0000-0000-0000000001a1', 'wp18-t-owner-a@test.local', 'authenticated', 'authenticated', '{"full_name":"Owner A"}'),
  ('18000000-0000-0000-0000-0000000001b1', 'wp18-t-owner-b@test.local', 'authenticated', 'authenticated', '{"full_name":"Owner B"}'),
  ('18000000-0000-0000-0000-0000000001d1', 'wp18-t-newbie@test.local',  'authenticated', 'authenticated', '{"full_name":"Newbie"}'),
  ('18000000-0000-0000-0000-0000000001d2', 'wp18-t-invitee@test.local', 'authenticated', 'authenticated', '{"full_name":"Invitee"}'),
  ('18000000-0000-0000-0000-0000000001f1', 'wp18-t-ghost@test.local',   'authenticated', 'authenticated', '{"full_name":"Ghost"}');

insert into public.organizations (id, name) values
  ('18000000-0000-0000-0000-00000000010a', 'WP18 T Org A'),
  ('18000000-0000-0000-0000-00000000010b', 'WP18 T Org B');

insert into public.organization_members (org_id, user_id, role, status) values
  ('18000000-0000-0000-0000-00000000010a', '18000000-0000-0000-0000-0000000001a1', 'owner', 'active'),
  ('18000000-0000-0000-0000-00000000010b', '18000000-0000-0000-0000-0000000001b1', 'owner', 'active');

insert into public.org_invites (org_id, email, role, status, invited_by) values
  ('18000000-0000-0000-0000-00000000010a', 'wp18-t-invitee@test.local', 'crew', 'pending', '18000000-0000-0000-0000-0000000001a1');

insert into public.platform_admins (user_id, note) values
  ('18000000-0000-0000-0000-0000000001f1', 'wp18 test ghost');

-- handle_new_user trigger ran for every auth.users insert
select is(
  (select count(*) from public.profiles where id::text like '18000000-0000-0000-0000-0000000001%'),
  5::bigint, 'handle_new_user created a profile per new auth user');

-- create_free_subscription trigger ran for every org insert
select is(
  (select count(*) from public.subscriptions
    where org_id in ('18000000-0000-0000-0000-00000000010a', '18000000-0000-0000-0000-00000000010b')
      and plan = 'free'),
  2::bigint, 'create_free_subscription gave each new org a free subscription');

-- ── owner A writes equipment: audit trigger + set_updated_at ──────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"18000000-0000-0000-0000-0000000001a1","role":"authenticated"}';

insert into public.equipment_items (id, org_id, name, location, quantity, updated_by, updated_at)
values ('18000000-0000-0000-0000-0000000001e1', '18000000-0000-0000-0000-00000000010a',
        'Sandbag', 'Truck', 10, 'Owner A', now() + interval '1 day');

select ok(
  (select updated_at <= now() from public.equipment_items where id = '18000000-0000-0000-0000-0000000001e1'),
  'set_updated_at clamps a future updated_at on insert');

update public.equipment_items
   set location = 'Stage', updated_at = now() - interval '2 days'
 where id = '18000000-0000-0000-0000-0000000001e1';

select ok(
  (select updated_at between now() - interval '2 days 1 minute' and now() - interval '1 day 23 hours'
     from public.equipment_items where id = '18000000-0000-0000-0000-0000000001e1'),
  'set_updated_at keeps an explicit 2-day-old action time (offline replay)');

update public.equipment_items set quantity = 9
 where id = '18000000-0000-0000-0000-0000000001e1';

select ok(
  (select updated_at = now() from public.equipment_items where id = '18000000-0000-0000-0000-0000000001e1'),
  'set_updated_at bumps updated_at when the client does not supply one');

select lives_ok(
  $$select public.log_damage_event('18000000-0000-0000-0000-0000000001e1', 'bent pin', null)$$,
  'log_damage_event accepts a member');

-- feedback: client-supplied org_id is overwritten with the caller's org
insert into public.beta_feedback (description, org_id)
values ('wp18 feedback', '18000000-0000-0000-0000-00000000010b');

-- ── owner B: damage RPC on org A's item is refused ────────────────────────
set local request.jwt.claims = '{"sub":"18000000-0000-0000-0000-0000000001b1","role":"authenticated"}';
select throws_ok(
  $$select public.log_damage_event('18000000-0000-0000-0000-0000000001e1', 'sabotage', null)$$,
  '42501', null, 'log_damage_event refuses a non-member');

-- ── checks as postgres ────────────────────────────────────────────────────
reset role;
select results_eq(
  $$select action from public.equipment_audit
     where equipment_id = '18000000-0000-0000-0000-0000000001e1' and action <> 'damage'
     order by at, action$$,
  $$values ('move'::text), ('create'::text), ('update'::text)$$,
  'audit trigger logged create, move (dated at the 2-day-old action time) and update');
select is(
  (select user_id from public.equipment_audit
    where equipment_id = '18000000-0000-0000-0000-0000000001e1' and action = 'damage'),
  '18000000-0000-0000-0000-0000000001a1'::uuid,
  'log_damage_event wrote one damage row as the caller');
select is(
  (select org_id from public.beta_feedback where description = 'wp18 feedback'),
  '18000000-0000-0000-0000-00000000010a'::uuid,
  'beta_feedback org_id is stamped from the caller''s membership, not the client');

-- ── bootstrap_session: brand-new user gets an owned org ───────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"18000000-0000-0000-0000-0000000001d1","role":"authenticated"}';
select is(
  (select public.bootstrap_session() ->> 'role'),
  'owner', 'bootstrap_session makes a new user owner of a new org');

-- ── bootstrap_session: pending invite is accepted ─────────────────────────
set local request.jwt.claims = '{"sub":"18000000-0000-0000-0000-0000000001d2","role":"authenticated","email":"wp18-t-invitee@test.local"}';
select is(
  (select public.bootstrap_session() ->> 'org_id'),
  '18000000-0000-0000-0000-00000000010a',
  'bootstrap_session joins an invited user to the inviting org');

reset role;
select results_eq(
  $$select role, status from public.organization_members
     where user_id = '18000000-0000-0000-0000-0000000001d2'$$,
  $$values ('crew'::text, 'active'::text)$$,
  'invitee is an active crew member');
select is(
  (select status from public.org_invites where email = 'wp18-t-invitee@test.local'),
  'accepted', 'invite is marked accepted');

-- ── ghost mode ────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"18000000-0000-0000-0000-0000000001a1","role":"authenticated"}';
select throws_ok(
  $$select public.ghost_set_org('18000000-0000-0000-0000-00000000010b')$$,
  '42501', null, 'a non-platform-admin cannot enter ghost mode');

set local request.jwt.claims = '{"sub":"18000000-0000-0000-0000-0000000001f1","role":"authenticated"}';
select lives_ok(
  $$select public.ghost_set_org('18000000-0000-0000-0000-00000000010b')$$,
  'platform admin can point ghost mode at an org');
select throws_ok(
  $$insert into public.equipment_items (org_id, name, location) values ('18000000-0000-0000-0000-00000000010b', 'Ghost write', 'Stage')$$,
  '42501', null, 'unarmed ghost cannot write to the target org');

select ok(public.ghost_arm_write(5) > now(), 'platform admin can arm ghost write (expiry in the future)');
select lives_ok(
  $$insert into public.equipment_items (org_id, name, location) values ('18000000-0000-0000-0000-00000000010b', 'Ghost write', 'Stage')$$,
  'armed ghost can write to the target org');
select throws_ok(
  $$insert into public.equipment_items (org_id, name, location) values ('18000000-0000-0000-0000-00000000010a', 'Wrong org', 'Truck')$$,
  '42501', null, 'armed ghost still cannot write to any other org');

reset role;
select * from finish();
rollback;
