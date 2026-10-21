-- WP04 behavior tests: RLS / audit integrity (audit IDs M20, L58, L60, L61,
-- L63, L64, L65, L66, L67, L68, L71, L72 + the organization_members policy
-- recursion fix).
--
-- Runs against the LOCAL stack after `supabase migration up`, entirely inside
-- one transaction that is rolled back — nothing persists.
--   docker exec -i supabase_db_griptrack psql -U postgres -d postgres -q \
--     < supabase/tests/wp04_rls_audit_integrity.sql 2>&1 | grep -E "PASS|FAIL|ERROR"
-- Expected: 23 lines starting "NOTICE:  PASS", no FAIL / ERROR.
-- Any failed assertion raises "FAIL <id>: ..." and stops the script.
--
-- increment_equipment_quantity is deliberately not exercised: on the current
-- schema it always fails with 42702 (ambiguous "item_id"); WP05 owns that RPC.

\set ON_ERROR_STOP on
begin;

-- ═══ Fixtures (as postgres) ═══════════════════════════════════════════════
-- Users: O owner, A admin, C1 crew team1, C2 crew team2, X outsider (org2), G ghost.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@wp04.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@wp04.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'crew1@wp04.test'),
  ('00000000-0000-0000-0000-0000000000a4', 'crew2@wp04.test'),
  ('00000000-0000-0000-0000-0000000000a5', 'outsider@wp04.test'),
  ('00000000-0000-0000-0000-0000000000a6', 'ghost@wp04.test'),
  ('00000000-0000-0000-0000-0000000000a7', 'leaver@wp04.test');
update public.profiles set full_name = 'Olive Owner' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set full_name = 'Adam Admin'  where id = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set full_name = 'Cara Crew'   where id = '00000000-0000-0000-0000-0000000000a3';
update public.profiles set full_name = 'Carl Crew'   where id = '00000000-0000-0000-0000-0000000000a4';

insert into public.organizations (id, name, features) values
  ('00000000-0000-0000-0000-0000000000b1', 'WP04 Org',  '{"teams_enabled": true, "requests_enabled": true}'),
  ('00000000-0000-0000-0000-0000000000b2', 'WP04 Org2', '{"teams_enabled": false, "requests_enabled": true}');
update public.subscriptions set stripe_customer_id = 'cus_wp04', stripe_subscription_id = 'sub_wp04'
 where org_id = '00000000-0000-0000-0000-0000000000b1';

insert into public.teams (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'Grip'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1', 'Electric');

insert into public.organization_members (org_id, user_id, role, team_id) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'owner', null),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', 'admin', null),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a3', 'crew',  '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a4', 'crew',  '00000000-0000-0000-0000-0000000000c2'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a7', 'crew',  '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a5', 'owner', null);

insert into public.equipment_items (id, org_id, team_id, name, location, quantity, updated_by) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 'C-stand',  'Truck', 10, 'seed'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c2', 'Skypanel', 'Truck', 4,  'seed'),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 'Sandbag',  'Truck', 20, 'seed');

insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000a6');
insert into public.platform_admin_state (user_id, active_org_id, write_enabled, write_expires_at)
values ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-0000000000b1', true, now() + interval '1 hour');

-- ═══ L63 stamp: service-role inserts above got team_id from the trigger ═══
do $$ begin
  if exists (select 1 from public.equipment_audit
              where equipment_id = '00000000-0000-0000-0000-0000000000d1'
                and team_id is distinct from '00000000-0000-0000-0000-0000000000c1') then
    raise exception 'FAIL L63: create row for d1 not stamped with team c1';
  end if;
  if (select actor from public.equipment_audit
       where equipment_id = '00000000-0000-0000-0000-0000000000d1' and action = 'create') <> 'seed' then
    raise exception 'FAIL M20: no-JWT insert should fall back to updated_by';
  end if;
  raise notice 'PASS L63 trigger stamps team_id; M20 no-JWT fallback';
end $$;

-- ═══ M20: crew C1 forges actor and backdates by 5 years ═══════════════════
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
set local role authenticated;
update public.equipment_items
   set status = 'Out', updated_by = 'Alice Forged', updated_at = now() - interval '5 years'
 where id = '00000000-0000-0000-0000-0000000000d1';
-- offline replay inside 30 days keeps action time
update public.equipment_items
   set quantity = 9, updated_by = 'Alice Forged', updated_at = now() - interval '2 days'
 where id = '00000000-0000-0000-0000-0000000000d1';
reset role;
do $$
declare r record; n int;
begin
  select count(*) into n from public.equipment_audit
   where equipment_id = '00000000-0000-0000-0000-0000000000d1' and action = 'update'
     and user_id = '00000000-0000-0000-0000-0000000000a3';
  if n <> 2 then raise exception 'FAIL M20: expected 2 update rows by C1, got %', n; end if;
  if exists (select 1 from public.equipment_audit
              where equipment_id = '00000000-0000-0000-0000-0000000000d1'
                and user_id = '00000000-0000-0000-0000-0000000000a3'
                and actor <> 'Cara Crew') then
    raise exception 'FAIL M20: actor not derived from profile';
  end if;
  if exists (select 1 from public.equipment_audit
              where equipment_id = '00000000-0000-0000-0000-0000000000d1'
                and at < now() - interval '31 days') then
    raise exception 'FAIL M20: 5-year backdate was not clamped';
  end if;
  if not exists (select 1 from public.equipment_audit
                  where equipment_id = '00000000-0000-0000-0000-0000000000d1'
                    and at between now() - interval '2 days 1 minute' and now() - interval '1 day 23 hours') then
    raise exception 'FAIL M20: 2-day-old offline action time was not kept';
  end if;
  raise notice 'PASS M20 actor derived, 5y backdate clamped, 2d replay kept';
end $$;

-- ═══ M20: delete attributed to the deleter, not the last editor ══════════
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
delete from public.equipment_items where id = '00000000-0000-0000-0000-0000000000d3';
reset role;
do $$ begin
  if (select actor from public.equipment_audit
       where equipment_id = '00000000-0000-0000-0000-0000000000d3' and action = 'delete') <> 'Adam Admin' then
    raise exception 'FAIL M20: delete row not attributed to deleter';
  end if;
  raise notice 'PASS M20 delete attributed to deleter';
end $$;

-- ═══ L64: damage/merge RPCs are team-scoped ═══════════════════════════════
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  begin
    perform public.log_damage_event('00000000-0000-0000-0000-0000000000d2', 'other team', null);
    raise exception 'FAIL L64: crew logged damage on another team''s item';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.log_merge_event('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d1', 1, 'A', 'B', null);
    raise exception 'FAIL L64: crew logged merge into another team''s item';
  exception when insufficient_privilege then null;
  end;
  perform public.log_damage_event('00000000-0000-0000-0000-0000000000d1', 'bent', now() - interval '1 year');
  perform public.log_merge_event('00000000-0000-0000-0000-0000000000d1', null, 2, 'Truck', 'Stage', now() - interval '1 hour');
  raise notice 'PASS L64 cross-team damage/merge rejected, own-team accepted';
end $$;
reset role;
do $$ begin
  if not exists (select 1 from public.equipment_audit
                  where equipment_id = '00000000-0000-0000-0000-0000000000d1' and action = 'damage'
                    and team_id = '00000000-0000-0000-0000-0000000000c1'
                    and actor = 'Cara Crew' and at > now() - interval '1 minute') then
    raise exception 'FAIL L64/M20: damage row missing team stamp or 1y p_at not clamped';
  end if;
  if not exists (select 1 from public.equipment_audit
                  where equipment_id = '00000000-0000-0000-0000-0000000000d1' and action = 'merge'
                    and at < now() - interval '59 minutes') then
    raise exception 'FAIL L64: 1h-old merge p_at should be kept';
  end if;
  raise notice 'PASS L64 RPC rows stamped; p_at clamp consistent with trigger';
end $$;

-- ═══ L63: audit visibility ════════════════════════════════════════════════
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
set local role authenticated;
do $$ declare mine int; other int; begin
  select count(*) filter (where team_id = '00000000-0000-0000-0000-0000000000c1'),
         count(*) filter (where team_id is distinct from '00000000-0000-0000-0000-0000000000c1')
    into mine, other from public.equipment_audit;
  if mine = 0 then raise exception 'FAIL L63: crew cannot see own team audit'; end if;
  if other <> 0 then raise exception 'FAIL L63: crew sees % rows of other teams', other; end if;
  raise notice 'PASS L63 crew sees only own team (% rows)', mine;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
do $$ begin
  if not exists (select 1 from public.equipment_audit where team_id = '00000000-0000-0000-0000-0000000000c2') then
    raise exception 'FAIL L63: admin cannot see team2 audit';
  end if;
  raise notice 'PASS L63 admin sees all teams';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.equipment_audit where org_id = '00000000-0000-0000-0000-0000000000b1') then
    raise exception 'FAIL L63: outsider sees org1 audit';
  end if;
  raise notice 'PASS L63 outsider sees nothing';
end $$;
reset role;
update public.organizations set features = '{"teams_enabled": false, "requests_enabled": true}'
 where id = '00000000-0000-0000-0000-0000000000b1';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if not exists (select 1 from public.equipment_audit where team_id = '00000000-0000-0000-0000-0000000000c2') then
    raise exception 'FAIL L63: teams-off crew should see whole org audit';
  end if;
  raise notice 'PASS L63 teams-off crew sees whole org';
end $$;
reset role;
update public.organizations set features = '{"teams_enabled": true, "requests_enabled": true}'
 where id = '00000000-0000-0000-0000-0000000000b1';

-- ═══ L63 backfill expression (same UPDATE as the migration) ══════════════
insert into public.equipment_audit (org_id, equipment_id, action, actor, snapshot_after, team_id)
values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d9', 'edit', 'legacy',
        jsonb_build_object('team_id', '00000000-0000-0000-0000-0000000000c2'), null);
update public.equipment_audit a
   set team_id = coalesce(
         nullif(a.snapshot_after ->> 'team_id', '')::uuid,
         nullif(a.snapshot_before ->> 'team_id', '')::uuid,
         (select e.team_id from public.equipment_items e where e.id = a.equipment_id)
       )
 where a.team_id is null;
do $$ begin
  if (select team_id from public.equipment_audit where equipment_id = '00000000-0000-0000-0000-0000000000d9')
     is distinct from '00000000-0000-0000-0000-0000000000c2' then
    raise exception 'FAIL L63: backfill did not read snapshot team_id';
  end if;
  raise notice 'PASS L63 backfill';
end $$;

-- ═══ L58: status pinned to active ═════════════════════════════════════════
do $$ begin
  begin
    update public.organization_members set status = 'disabled'
     where user_id = '00000000-0000-0000-0000-0000000000a4';
    raise exception 'FAIL L58: disabled status accepted';
  exception when check_violation then null;
  end;
  raise notice 'PASS L58 status pinned to active';
end $$;

-- ═══ L60: admins can change role/team_id only ═════════════════════════════
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
do $$ declare n int; begin
  update public.organization_members set role = 'admin'
   where user_id = '00000000-0000-0000-0000-0000000000a3';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL L60: crew promoted itself'; end if;
  raise notice 'PASS L60 crew cannot edit memberships';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
do $$ declare n int; begin
  begin
    update public.organization_members set user_id = '00000000-0000-0000-0000-0000000000a5'
     where user_id = '00000000-0000-0000-0000-0000000000a4';
    raise exception 'FAIL L60: admin rewrote user_id';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.organization_members set org_id = '00000000-0000-0000-0000-0000000000b2'
     where user_id = '00000000-0000-0000-0000-0000000000a4';
    raise exception 'FAIL L60: admin rewrote org_id';
  exception when insufficient_privilege then null;
  end;
  update public.organization_members set role = 'department_head'
   where user_id = '00000000-0000-0000-0000-0000000000a4';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL L60: admin role change affected % rows', n; end if;
  update public.organization_members set team_id = '00000000-0000-0000-0000-0000000000c1'
   where user_id = '00000000-0000-0000-0000-0000000000a4';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL L60: admin team change affected % rows', n; end if;
  update public.organization_members set role = 'admin'
   where user_id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL L60: admin changed the owner row'; end if;
  begin
    update public.organization_members set role = 'owner'
     where user_id = '00000000-0000-0000-0000-0000000000a4';
    raise exception 'FAIL L60: admin granted owner';
  exception when insufficient_privilege then null;
  end;
  delete from public.organization_members where user_id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL L60: admin deleted the owner row'; end if;
  delete from public.organization_members where user_id = '00000000-0000-0000-0000-0000000000a7';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL L60: admin could not remove a crew member (got % rows)', n; end if;
  raise notice 'PASS L60 user_id/org_id locked; role/team_id editable and remove works (no 42P17); owner row untouchable';
end $$;
reset role;
update public.organization_members set role = 'crew', team_id = '00000000-0000-0000-0000-0000000000c2'
 where user_id = '00000000-0000-0000-0000-0000000000a4';

-- ═══ L61: armed ghost cannot join or touch the owner ══════════════════════
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}', true);
set local role authenticated;
do $$ declare n int; begin
  if not public.ghost_can_write('00000000-0000-0000-0000-0000000000b1') then
    raise exception 'SETUP: ghost should be armed';
  end if;
  begin
    insert into public.organization_members (org_id, user_id, role)
    values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a6', 'crew');
    raise exception 'FAIL L61: armed ghost inserted a membership';
  exception when insufficient_privilege then null;
  end;
  update public.organization_members set team_id = null
   where user_id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL L61: ghost updated the owner row'; end if;
  delete from public.organization_members where user_id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL L61: ghost deleted the owner row'; end if;
  update public.organization_members set team_id = '00000000-0000-0000-0000-0000000000c1'
   where user_id = '00000000-0000-0000-0000-0000000000a4';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL L61: ghost can no longer manage non-owner rows'; end if;
  raise notice 'PASS L61 ghost cannot self-insert or touch owner; can still edit crew';
end $$;
reset role;
do $$ begin
  if (select column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'organization_members' and column_name = 'role')
     <> '''crew''::text' then
    raise exception 'FAIL L61: role default is not crew';
  end if;
  raise notice 'PASS L61 role default crew';
end $$;

-- ═══ L65 / L72: request inserts ═══════════════════════════════════════════
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
set local role authenticated;
do $$ declare v_name text; begin
  begin
    insert into public.equipment_requests (org_id, requested_by, requester_name, item_name)
    values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a4', 'Carl Crew', 'Gels');
    raise exception 'FAIL L65: request filed as a colleague';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.equipment_requests (org_id, requested_by, item_name, status, reviewed_by)
    values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a3', 'Gels', 'approved', 'Olive Owner');
    raise exception 'FAIL L65: pre-approved request accepted';
  exception when insufficient_privilege then null;
  end;
  -- exactly what both clients send
  insert into public.equipment_requests (id, org_id, requested_by, requester_name, item_name, quantity, notes, status, reviewed_by, reviewed_at)
  values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a3',
          'Somebody Else', 'Gels', 2, null, 'pending', null, null);
  select requester_name into v_name from public.equipment_requests where id = '00000000-0000-0000-0000-0000000000e1';
  if v_name <> 'Cara Crew' then raise exception 'FAIL L65: requester_name not stamped (got %)', v_name; end if;
  raise notice 'PASS L65 forged requester/status rejected; requester_name stamped';
end $$;
reset role;
update public.organizations set features = '{"teams_enabled": true, "requests_enabled": false}'
 where id = '00000000-0000-0000-0000-0000000000b1';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  begin
    insert into public.equipment_requests (org_id, requested_by, requester_name, item_name)
    values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a3', 'Cara Crew', 'Gels');
    raise exception 'FAIL L72: request accepted while requests are disabled';
  exception when insufficient_privilege then null;
  end;
  if not exists (select 1 from public.equipment_requests where id = '00000000-0000-0000-0000-0000000000e1') then
    raise exception 'FAIL L72: existing requests must stay readable when disabled';
  end if;
  raise notice 'PASS L72 inserts blocked when disabled; history readable';
end $$;
reset role;
update public.organizations set features = '{"teams_enabled": true, "requests_enabled": true}'
 where id = '00000000-0000-0000-0000-0000000000b1';

-- ═══ L67: profile email pinned to auth email; resync on change ════════════
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
set local role authenticated;
-- same statement shape as the web upsert (CompleteProfile / InviteAccept)
insert into public.profiles (id, email, full_name)
values ('00000000-0000-0000-0000-0000000000a3', 'ceo@evil.test', 'Cara C.')
on conflict (id) do update set email = excluded.email, full_name = excluded.full_name;
update public.profiles set email = 'ceo@evil.test' where id = '00000000-0000-0000-0000-0000000000a3';
reset role;
do $$ begin
  if (select email from public.profiles where id = '00000000-0000-0000-0000-0000000000a3') <> 'crew1@wp04.test' then
    raise exception 'FAIL L67: client overwrote profiles.email';
  end if;
  if (select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a3') <> 'Cara C.' then
    raise exception 'FAIL L67: full_name upsert broke';
  end if;
  raise notice 'PASS L67 email pinned; full_name still editable via upsert';
end $$;
update auth.users set email = 'cara.new@wp04.test' where id = '00000000-0000-0000-0000-0000000000a3';
do $$ begin
  if (select email from public.profiles where id = '00000000-0000-0000-0000-0000000000a3') <> 'cara.new@wp04.test' then
    raise exception 'FAIL L67: auth email change not resynced';
  end if;
  if (select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a3') <> 'Cara C.' then
    raise exception 'FAIL L67: resync clobbered full_name';
  end if;
  raise notice 'PASS L67 auth email change resynced';
end $$;

-- ═══ L68: Stripe ids hidden from members ══════════════════════════════════
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
set local role authenticated;
do $$ declare b jsonb; r record; begin
  -- the narrowed web select
  select plan, status, current_period_end, cancel_at_period_end into r
    from public.subscriptions where org_id = '00000000-0000-0000-0000-0000000000b1';
  if r.plan is null then raise exception 'FAIL L68: member cannot read plan'; end if;
  if not (select has_stripe_customer from public.subscriptions where org_id = '00000000-0000-0000-0000-0000000000b1') then
    raise exception 'FAIL L68: has_stripe_customer should be true';
  end if;
  begin
    perform stripe_customer_id from public.subscriptions where org_id = '00000000-0000-0000-0000-0000000000b1';
    raise exception 'FAIL L68: member can read stripe_customer_id';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.subscriptions s where s.org_id = '00000000-0000-0000-0000-0000000000b1' and s.stripe_subscription_id is not null;
    raise exception 'FAIL L68: member can read stripe_subscription_id';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.subscriptions set plan = 'pro' where org_id = '00000000-0000-0000-0000-0000000000b1';
    raise exception 'FAIL L68: member can write subscriptions';
  exception when insufficient_privilege then null;
  end;
  b := public.bootstrap_session();
  if (b -> 'subscription') ? 'stripe_customer_id' or (b -> 'subscription') ? 'stripe_subscription_id' then
    raise exception 'FAIL L68: bootstrap_session still returns stripe ids';
  end if;
  if (b -> 'subscription' ->> 'has_stripe_customer')::boolean is distinct from true then
    raise exception 'FAIL L68: bootstrap_session missing has_stripe_customer';
  end if;
  if (b ->> 'org_id')::uuid <> '00000000-0000-0000-0000-0000000000b1' or b ->> 'role' <> 'crew' then
    raise exception 'FAIL L68: bootstrap_session shape changed: %', b;
  end if;
  raise notice 'PASS L68 stripe ids hidden (select + bootstrap); plan/status readable';
end $$;
reset role;

-- ═══ L66: future functions not executable by anon/PUBLIC ══════════════════
create function public.wp04_probe() returns int language sql as 'select 1';
do $$ begin
  if has_function_privilege('anon', 'public.wp04_probe()', 'execute') then
    raise exception 'FAIL L66: anon can execute a new function';
  end if;
  if not has_function_privilege('authenticated', 'public.wp04_probe()', 'execute')
     or not has_function_privilege('service_role', 'public.wp04_probe()', 'execute') then
    raise exception 'FAIL L66: authenticated/service_role lost default execute';
  end if;
  raise notice 'PASS L66 default privileges';
end $$;

-- ═══ L71 / L65 FK ═════════════════════════════════════════════════════════
do $$ begin
  begin
    insert into public.equipment_items (name, location) values ('orphan', 'nowhere');
    raise exception 'FAIL L71: equipment_items accepted NULL org_id';
  exception when not_null_violation then null;
  end;
  begin
    insert into public.equipment_audit (equipment_id, action) values (gen_random_uuid(), 'create');
    raise exception 'FAIL L71: equipment_audit accepted NULL org_id';
  exception when not_null_violation then null;
  end;
  begin
    insert into public.equipment_requests (org_id, item_name) values (gen_random_uuid(), 'x');
    raise exception 'FAIL L65: equipment_requests accepted unknown org_id';
  exception when foreign_key_violation then null;
  end;
  raise notice 'PASS L71 NOT NULL org_id; L65 requests FK';
end $$;

-- ═══ Shipped-mobile compatibility smoke ═══════════════════════════════════
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
set local role authenticated;
do $$ declare n int; begin
  -- crew move (location + updated_by + updated_at patch), as mobile sends it
  update public.equipment_items set location = 'Stage', updated_by = 'crew1@wp04.test', updated_at = now()
   where id = '00000000-0000-0000-0000-0000000000d1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL compat: crew move blocked'; end if;
  perform public.log_damage_event('00000000-0000-0000-0000-0000000000d1', null, null);
  raise notice 'PASS compat: mobile write paths unchanged';
end $$;
reset role;

rollback;
