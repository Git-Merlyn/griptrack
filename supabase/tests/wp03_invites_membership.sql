-- supabase/tests/wp03_invites_membership.sql
-- Behaviour tests for WP03 (audit H2, H3, H4, L62). Runs entirely inside
-- BEGIN ... ROLLBACK; leaves no data behind. Any failed check raises and,
-- with ON_ERROR_STOP, psql exits non-zero.
--
-- Run (after `supabase migration up`):
--   docker exec -i supabase_db_griptrack psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -q < supabase/tests/wp03_invites_membership.sql
-- Expected last line: WP03 OK

\set ON_ERROR_STOP 1
begin;

-- ── Fixtures (as postgres) ─────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@a.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@a.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'crew@a.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner@b.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'placeholder@c.test'),
  ('00000000-0000-0000-0000-0000000000d1', 'used@d.test'),
  ('00000000-0000-0000-0000-0000000000e1', 'fresh@e.test');

insert into public.organizations (id, name) values
  ('0000000a-0000-0000-0000-000000000000', 'Org A'),
  ('0000000b-0000-0000-0000-000000000000', 'Org B'),
  ('0000000c-0000-0000-0000-000000000000', 'New Company'),
  ('0000000d-0000-0000-0000-000000000000', 'New Company');

-- WP09 plan limits: org A sends invites, which Free orgs cannot.
update public.subscriptions set plan = 'team', status = 'active'
 where org_id = '0000000a-0000-0000-0000-000000000000';

insert into public.teams (id, org_id, name) values
  ('000000a7-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', 'Grip');

insert into public.organization_members (org_id, user_id, role, status) values
  ('0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a1', 'owner', 'active'),
  ('0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2', 'admin', 'active'),
  ('0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a3', 'crew',  'active'),
  ('0000000b-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', 'owner', 'active'),
  ('0000000c-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'owner', 'active'),
  ('0000000d-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000d1', 'owner', 'active');

-- Org D is a placeholder name but has data, so it is NOT disposable.
insert into public.equipment_items (org_id, name, location)
values ('0000000d-0000-0000-0000-000000000000', 'C-stand', 'Truck');

-- ── T1 (H2): admin cannot insert any invite, least of all an owner invite ──
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
do $$
begin
  begin
    insert into public.org_invites (org_id, email, role, status)
    values ('0000000a-0000-0000-0000-000000000000', 'admin@a.test', 'owner', 'pending');
    raise exception 'T1 FAIL: admin inserted an owner invite';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.org_invites (org_id, email, role, status)
    values ('0000000a-0000-0000-0000-000000000000', 'x@a.test', 'crew', 'pending');
    raise exception 'T1 FAIL: admin inserted an invite directly';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- CHECK rejects 'owner' even for privileged writers (invite-staff/service role).
do $$
begin
  insert into public.org_invites (org_id, email, role)
  values ('0000000a-0000-0000-0000-000000000000', 'y@a.test', 'owner');
  raise exception 'T1 FAIL: org_invites accepted role owner';
exception when check_violation then null;
end $$;

-- L62: default role is crew.
do $$
declare v text;
begin
  insert into public.org_invites (org_id, email)
  values ('0000000a-0000-0000-0000-000000000000', 'default@a.test')
  returning role into v;
  if v <> 'crew' then raise exception 'T1 FAIL: default role is %', v; end if;
  delete from public.org_invites where email = 'default@a.test';
end $$;

-- ── T2 (H3): re-invite never changes an existing member's role ─────────────
-- Simulate invite-staff (service role) re-inviting the owner and the admin as crew.
insert into public.org_invites (org_id, email, role, status) values
  ('0000000a-0000-0000-0000-000000000000', 'owner@a.test', 'crew', 'pending'),
  ('0000000a-0000-0000-0000-000000000000', 'admin@a.test', 'crew', 'pending');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$
declare b jsonb := public.bootstrap_session();
begin
  if b->>'role' <> 'owner' then raise exception 'T2 FAIL: owner demoted to %', b->>'role'; end if;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
do $$
declare b jsonb := public.bootstrap_session();
begin
  if b->>'role' <> 'admin' then raise exception 'T2 FAIL: admin role changed to %', b->>'role'; end if;
end $$;
reset role;

do $$
begin
  if (select role from public.organization_members
       where user_id = '00000000-0000-0000-0000-0000000000a1') <> 'owner' then
    raise exception 'T2 FAIL: owner row changed';
  end if;
  if exists (select 1 from public.org_invites
              where email in ('owner@a.test', 'admin@a.test') and status <> 'accepted') then
    raise exception 'T2 FAIL: re-invites to existing members not marked accepted';
  end if;
end $$;

-- ── T3 (H4): invitee in another real org can still log in ──────────────────
insert into public.org_invites (org_id, email, role, status)
values ('0000000a-0000-0000-0000-000000000000', 'owner@b.test', 'crew', 'pending');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
do $$
declare b jsonb := public.bootstrap_session();   -- must not raise
begin
  if (b->>'org_id')::uuid <> '0000000b-0000-0000-0000-000000000000' or b->>'role' <> 'owner' then
    raise exception 'T3 FAIL: other-org user bootstrapped into % as %', b->>'org_id', b->>'role';
  end if;
end $$;
reset role;

do $$
begin
  if (select status from public.org_invites where email = 'owner@b.test') <> 'pending' then
    raise exception 'T3 FAIL: blocked invite should stay pending';
  end if;
end $$;

-- ── T4 (H4): untouched placeholder org is dissolved and the invite lands ───
insert into public.org_invites (org_id, email, role, status, team_id)
values ('0000000a-0000-0000-0000-000000000000', 'placeholder@c.test', 'department_head', 'pending',
        '000000a7-0000-0000-0000-000000000000');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
do $$
declare b jsonb := public.bootstrap_session();
begin
  if (b->>'org_id')::uuid <> '0000000a-0000-0000-0000-000000000000'
     or b->>'role' <> 'department_head'
     or (b->>'team_id')::uuid <> '000000a7-0000-0000-0000-000000000000' then
    raise exception 'T4 FAIL: placeholder user got %', b;
  end if;
end $$;
reset role;

do $$
begin
  if exists (select 1 from public.organizations where id = '0000000c-0000-0000-0000-000000000000') then
    raise exception 'T4 FAIL: placeholder org not dissolved';
  end if;
end $$;

-- ── T5 (H4): placeholder-named org WITH data is kept; invite stays pending ─
insert into public.org_invites (org_id, email, role, status)
values ('0000000a-0000-0000-0000-000000000000', 'used@d.test', 'crew', 'pending');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
do $$
declare b jsonb := public.bootstrap_session();
begin
  if (b->>'org_id')::uuid <> '0000000d-0000-0000-0000-000000000000' then
    raise exception 'T5 FAIL: used org user moved to %', b->>'org_id';
  end if;
end $$;
reset role;

do $$
begin
  if not exists (select 1 from public.organizations where id = '0000000d-0000-0000-0000-000000000000') then
    raise exception 'T5 FAIL: org with data was deleted';
  end if;
end $$;

-- ── T6: brand-new user still joins via invite (regression) ─────────────────
insert into public.org_invites (org_id, email, role, status)
values ('0000000a-0000-0000-0000-000000000000', 'fresh@e.test', 'admin', 'pending');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
do $$
declare b jsonb := public.bootstrap_session();
begin
  if (b->>'org_id')::uuid <> '0000000a-0000-0000-0000-000000000000' or b->>'role' <> 'admin' then
    raise exception 'T6 FAIL: fresh invitee got %', b;
  end if;
end $$;
reset role;

-- ── T7: revoke via RLS (admin yes, crew no, status column only) ────────────
insert into public.org_invites (id, org_id, email, role, status) values
  ('11111111-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-000000000000', 'r1@a.test', 'crew', 'pending'),
  ('11111111-0000-0000-0000-000000000002', '0000000a-0000-0000-0000-000000000000', 'r2@a.test', 'crew', 'pending');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
do $$
declare n int;
begin
  select count(*) into n from public.org_invites;
  if n <> 0 then raise exception 'T7 FAIL: crew can read % invites', n; end if;
  update public.org_invites set status = 'revoked' where id = '11111111-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T7 FAIL: crew revoked an invite'; end if;
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
do $$
declare n int; v_id uuid;
begin
  -- same shape PostgREST sends for .update().eq().eq().select('id')
  update public.org_invites set status = 'revoked'
   where id = '11111111-0000-0000-0000-000000000001' and status = 'pending'
  returning id into v_id;
  if v_id is null then raise exception 'T7 FAIL: admin could not revoke'; end if;

  -- cannot un-revoke (USING requires pending)
  update public.org_invites set status = 'pending' where id = '11111111-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T7 FAIL: admin re-opened a revoked invite'; end if;

  -- cannot set any status other than revoked
  begin
    update public.org_invites set status = 'accepted' where id = '11111111-0000-0000-0000-000000000002';
    raise exception 'T7 FAIL: admin set status accepted';
  exception when insufficient_privilege then null;   -- RLS WITH CHECK violation is 42501
  end;

  -- cannot touch role (column privilege)
  begin
    update public.org_invites set role = 'admin' where id = '11111111-0000-0000-0000-000000000002';
    raise exception 'T7 FAIL: admin changed an invite role';
  exception when insufficient_privilege then null;
  end;

  -- cannot delete
  begin
    delete from public.org_invites where id = '11111111-0000-0000-0000-000000000002';
    raise exception 'T7 FAIL: admin deleted an invite';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ── T8: invite-staff helpers ───────────────────────────────────────────────
do $$
declare a uuid := '0000000a-0000-0000-0000-000000000000';
begin
  if public.invite_target_status(a, 'nobody@x.test')  <> 'no_account' then raise exception 'T8 FAIL no_account'; end if;
  if public.invite_target_status(a, ' Owner@A.test ') <> 'member'     then raise exception 'T8 FAIL member'; end if;
  if public.invite_target_status(a, 'owner@b.test')   <> 'other_org'  then raise exception 'T8 FAIL other_org'; end if;
  if public.invite_target_status(a, 'used@d.test')    <> 'other_org'  then raise exception 'T8 FAIL used placeholder'; end if;

  if not public.record_invite_send(a, '00000000-0000-0000-0000-0000000000a2', 'q1@a.test', 2) then raise exception 'T8 FAIL send 1'; end if;
  if not public.record_invite_send(a, '00000000-0000-0000-0000-0000000000a2', 'q2@a.test', 2) then raise exception 'T8 FAIL send 2'; end if;
  if public.record_invite_send(a, '00000000-0000-0000-0000-0000000000a2', 'q3@a.test', 2)     then raise exception 'T8 FAIL limit not enforced'; end if;
  if (select count(*) from public.invite_sends where org_id = a) <> 2 then raise exception 'T8 FAIL over-limit send recorded'; end if;
end $$;

-- placeholder status: new user with an untouched New Company org
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'ph2@f.test');
insert into public.organizations (id, name) values ('0000000f-0000-0000-0000-000000000000', 'New Company');
insert into public.organization_members (org_id, user_id, role, status)
values ('0000000f-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'owner', 'active');
do $$
begin
  if public.invite_target_status('0000000a-0000-0000-0000-000000000000', 'ph2@f.test') <> 'placeholder_org' then
    raise exception 'T8 FAIL placeholder_org';
  end if;
end $$;

-- helpers are not callable by clients
set local role authenticated;
do $$
begin
  begin
    perform public.invite_target_status('0000000a-0000-0000-0000-000000000000', 'owner@a.test');
    raise exception 'T8 FAIL: authenticated can call invite_target_status';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_invite_send('0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2', 'z@a.test', 20);
    raise exception 'T8 FAIL: authenticated can call record_invite_send';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ── T9: invite_sends rows die with their org ───────────────────────────────
do $$
begin
  delete from public.organization_members where org_id = '0000000b-0000-0000-0000-000000000000';
  perform public.record_invite_send('0000000b-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', 'k@b.test', 20);
  delete from public.org_invites where org_id = '0000000b-0000-0000-0000-000000000000';
  delete from public.subscriptions where org_id = '0000000b-0000-0000-0000-000000000000';
  delete from public.organizations where id = '0000000b-0000-0000-0000-000000000000';
  if exists (select 1 from public.invite_sends where org_id = '0000000b-0000-0000-0000-000000000000') then
    raise exception 'T9 FAIL: invite_sends survived org delete';
  end if;
end $$;

-- ── T10 (H4): any error inside invite acceptance cannot break login ───────
-- Force the membership insert for this invite to fail; bootstrap must still
-- return a session (the user falls through to ensure_org_for_user).
create function public.wp03_test_boom() returns trigger language plpgsql as $$
begin
  if new.org_id = '0000000a-0000-0000-0000-000000000000' then
    raise exception 'wp03 forced failure';
  end if;
  return new;
end $$;
create trigger wp03_test_boom before insert on public.organization_members
  for each row execute function public.wp03_test_boom();

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f9', 'boom@g.test');
insert into public.org_invites (org_id, email, role, status)
values ('0000000a-0000-0000-0000-000000000000', 'boom@g.test', 'crew', 'pending');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f9","role":"authenticated"}';
do $$
declare b jsonb := public.bootstrap_session();   -- must not raise
begin
  if b is null or b->>'org_id' is null or (b->>'org_id')::uuid = '0000000a-0000-0000-0000-000000000000' then
    raise exception 'T10 FAIL: unexpected bootstrap %', b;
  end if;
end $$;
reset role;
drop trigger wp03_test_boom on public.organization_members;

select 'WP03 OK';
rollback;
