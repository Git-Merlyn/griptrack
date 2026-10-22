-- WP14 behavior test for bootstrap_session (L7, L28). Everything rolls back.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000e141', 'wp14-noinvite@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e142', 'wp14-invitee@example.test',  'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e143', 'wp14-admin@example.test',    'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e144', 'wp14-member@example.test',   'authenticated', 'authenticated');
insert into public.organizations (id, name) values
  ('00000000-0000-0000-0000-0000000e1400', 'WP14 Inviting Org');
insert into public.organization_members (org_id, user_id, role, status) values
  ('00000000-0000-0000-0000-0000000e1400', '00000000-0000-0000-0000-00000000e143', 'owner', 'active'),
  ('00000000-0000-0000-0000-0000000e1400', '00000000-0000-0000-0000-00000000e144', 'crew',  'active');
insert into public.org_invites (org_id, email, role, status) values
  ('00000000-0000-0000-0000-0000000e1400', 'wp14-invitee@example.test', 'crew', 'pending');
insert into public.platform_admins (user_id) values
  ('00000000-0000-0000-0000-00000000e143');

create temp table wp14_out (label text primary key, v jsonb) on commit drop;
grant all on wp14_out to authenticated;

set local role authenticated;

-- T1 (L28): from an invite link with no pending invite -> no org created.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000e141","role":"authenticated"}';
insert into wp14_out values ('t1', public.bootstrap_session(true));
-- T2: plain bootstrap for the same user still creates their own org.
insert into wp14_out values ('t2', public.bootstrap_session());
-- T3 (L28): invitee from the invite link -> invite accepted, joins the org.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000e142","role":"authenticated"}';
insert into wp14_out values ('t3', public.bootstrap_session(true));
-- T4: same invitee reloads /invite-accept -> already a member, nothing accepted.
insert into wp14_out values ('t4', public.bootstrap_session(true));
-- T5 (L7): platform admin flag.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000e143","role":"authenticated"}';
insert into wp14_out values ('t5', public.bootstrap_session());
-- T6 (L7): ordinary member.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000e144","role":"authenticated"}';
insert into wp14_out values ('t6', public.bootstrap_session());

reset role;

do $$
declare
  t1 jsonb := (select v from wp14_out where label = 't1');
  t2 jsonb := (select v from wp14_out where label = 't2');
  t3 jsonb := (select v from wp14_out where label = 't3');
  t4 jsonb := (select v from wp14_out where label = 't4');
  t5 jsonb := (select v from wp14_out where label = 't5');
  t6 jsonb := (select v from wp14_out where label = 't6');
begin
  if t1 ->> 'org_id' is not null then raise exception 'FAIL T1: org_id should be null, got %', t1; end if;
  if (t1 ->> 'invite_accepted')::boolean then raise exception 'FAIL T1: invite_accepted should be false'; end if;
  if (t1 ->> 'is_platform_admin')::boolean then raise exception 'FAIL T1: not an admin'; end if;
  if t2 ->> 'org_id' is null or t2 ->> 'role' <> 'owner' then raise exception 'FAIL T2: plain bootstrap must create an owned org, got %', t2; end if;
  if (select count(*) from public.organization_members where user_id = '00000000-0000-0000-0000-00000000e141') <> 1 then
    raise exception 'FAIL T1/T2: expected exactly one membership after the plain bootstrap';
  end if;
  if t3 ->> 'org_id' <> '00000000-0000-0000-0000-0000000e1400' or not (t3 ->> 'invite_accepted')::boolean then
    raise exception 'FAIL T3: invite should be accepted into the inviting org, got %', t3;
  end if;
  if t4 ->> 'org_id' <> '00000000-0000-0000-0000-0000000e1400' or (t4 ->> 'invite_accepted')::boolean then
    raise exception 'FAIL T4: reload should report the org with invite_accepted=false, got %', t4;
  end if;
  if not (t5 ->> 'is_platform_admin')::boolean then raise exception 'FAIL T5: admin flag missing, got %', t5; end if;
  if (t6 ->> 'is_platform_admin')::boolean then raise exception 'FAIL T6: non-admin flagged'; end if;
  if not (t6 ? 'subscription' and t6 ? 'profile' and t6 ? 'team_id' and t6 ? 'ghost' and t6 ? 'ghost_write') then
    raise exception 'FAIL T6: response shape changed, got %', t6;
  end if;
  raise notice 'WP14 OK';
end $$;

rollback;
