-- Behavior test for WP09 plan limits (audit M9).
-- Run AFTER the WP09 migration is applied locally (supabase migration up):
--   docker exec -i supabase_db_griptrack psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/behavior-tests/plan_limits.sql
-- Everything runs inside BEGIN ... ROLLBACK; nothing persists.
-- Success = last NOTICE is "WP09 plan_limits: ALL PASS", then ROLLBACK.

\set QUIET on
begin;

-- Run one SQL statement as a JWT role. Returns 'OK', or '<hint> | <message>'
-- for an error (hint is empty for errors that have none).
create function pg_temp.wp09_as(p_uid uuid, p_role text, p_sql text) returns text
language plpgsql as $$
declare
  v_hint text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_role)::text, true);
  perform set_config('role', p_role, true);
  begin
    execute p_sql;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    return 'OK';
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    return coalesce(v_hint, '') || ' | ' || sqlerrm;
  end;
end $$;

-- Owner + org. The org keeps the column default trial_ends_at = now() + 14 days
-- unless p_trial_days says otherwise: that date must grant nothing.
-- p_plan null = delete the auto-created subscriptions row.
create function pg_temp.wp09_org(p_id uuid, p_trial_days int, p_plan text, p_status text)
returns void language plpgsql as $$
begin
  insert into auth.users (id, email) values (p_id, p_id::text || '@wp09.test');
  insert into public.organizations (id, name) values (p_id, 'WP09 org');
  if p_trial_days is not null then
    update public.organizations
       set trial_ends_at = now() + make_interval(days => p_trial_days)
     where id = p_id;
  end if;
  if p_plan is null then
    delete from public.subscriptions where org_id = p_id;
  else
    update public.subscriptions set plan = p_plan, status = p_status where org_id = p_id;
  end if;
  insert into public.organization_members (org_id, user_id, role) values (p_id, p_id, 'owner');
end $$;

do $$
declare
  free_org   constant uuid := '99000000-0000-0000-0000-000000000001'; -- new org: default 14-day trial_ends_at
  lapsed_org constant uuid := '99000000-0000-0000-0000-000000000002'; -- trial_ends_at in the past
  pro_org    constant uuid := '99000000-0000-0000-0000-000000000003';
  pd_org     constant uuid := '99000000-0000-0000-0000-000000000004';
  team_org   constant uuid := '99000000-0000-0000-0000-000000000005';
  stripe_trial_org constant uuid := '99000000-0000-0000-0000-000000000006';
  canceled_org constant uuid := '99000000-0000-0000-0000-000000000007';
  nosub_org  constant uuid := '99000000-0000-0000-0000-000000000008';
  far_trial_org constant uuid := '99000000-0000-0000-0000-000000000009'; -- trial_ends_at far in the future
  v text;
  i int;
begin
  perform pg_temp.wp09_org(free_org,         null, 'free', 'active');
  perform pg_temp.wp09_org(lapsed_org,       -1,   'free', 'active');
  perform pg_temp.wp09_org(pro_org,          null, 'pro',  'active');
  perform pg_temp.wp09_org(pd_org,           null, 'pro',  'past_due');
  perform pg_temp.wp09_org(team_org,         null, 'team', 'active');
  perform pg_temp.wp09_org(stripe_trial_org, null, 'pro',  'trialing');
  perform pg_temp.wp09_org(canceled_org,     null, 'pro',  'canceled');
  perform pg_temp.wp09_org(nosub_org,        null, null,   null);
  perform pg_temp.wp09_org(far_trial_org,    3650, 'free', 'active');

  -- ── org_effective_plan / user_effective_plan ─────────────────────────
  if (select trial_ends_at from public.organizations where id = free_org) <= now() then
    raise exception 'FAIL fixture: free_org should carry the default future trial_ends_at'; end if;
  if public.org_effective_plan(free_org)         <> 'free' then raise exception 'FAIL plan free_org (future trial_ends_at must not grant pro)'; end if;
  if public.org_effective_plan(far_trial_org)    <> 'free' then raise exception 'FAIL plan far_trial_org'; end if;
  if public.org_effective_plan(lapsed_org)       <> 'free' then raise exception 'FAIL plan lapsed_org'; end if;
  if public.org_effective_plan(pro_org)          <> 'pro'  then raise exception 'FAIL plan pro_org'; end if;
  if public.org_effective_plan(pd_org)           <> 'pro'  then raise exception 'FAIL plan past_due'; end if;
  if public.org_effective_plan(team_org)         <> 'team' then raise exception 'FAIL plan team_org'; end if;
  if public.org_effective_plan(stripe_trial_org) <> 'pro'  then raise exception 'FAIL plan stripe trial'; end if;
  if public.org_effective_plan(canceled_org)     <> 'free' then raise exception 'FAIL plan canceled'; end if;
  if public.org_effective_plan(nosub_org)        <> 'free' then raise exception 'FAIL plan no subscriptions row'; end if;
  if public.user_effective_plan(pro_org)         <> 'pro'  then raise exception 'FAIL user plan pro'; end if;
  if public.user_effective_plan(free_org)        <> 'free' then raise exception 'FAIL user plan free'; end if;
  if public.user_effective_plan(gen_random_uuid()) <> 'free' then raise exception 'FAIL user plan none'; end if;
  -- platform-admin ghost: acts on the org it points at (as bootstrap_session does)
  insert into auth.users (id, email) values ('99000000-0000-0000-0000-0000000000a1', 'ghost@wp09.test');
  insert into public.organization_members (org_id, user_id, role)
    values (canceled_org, '99000000-0000-0000-0000-0000000000a1', 'admin');
  insert into public.platform_admins (user_id) values ('99000000-0000-0000-0000-0000000000a1');
  insert into public.platform_admin_state (user_id, active_org_id)
    values ('99000000-0000-0000-0000-0000000000a1', pro_org);
  if public.user_effective_plan('99000000-0000-0000-0000-0000000000a1') <> 'pro' then
    raise exception 'FAIL user plan ghost pointed at pro_org'; end if;
  update public.platform_admin_state set active_org_id = null
   where user_id = '99000000-0000-0000-0000-0000000000a1';
  if public.user_effective_plan('99000000-0000-0000-0000-0000000000a1') <> 'free' then
    raise exception 'FAIL user plan ghost not pointed (own canceled org)'; end if;
  update public.platform_admin_state set active_org_id = pro_org
   where user_id = '99000000-0000-0000-0000-0000000000a1';
  delete from public.platform_admins where user_id = '99000000-0000-0000-0000-0000000000a1';
  if public.user_effective_plan('99000000-0000-0000-0000-0000000000a1') <> 'free' then
    raise exception 'FAIL user plan: stale ghost state without platform_admins row'; end if;
  raise notice 'PASS org_effective_plan / user_effective_plan (trial_ends_at grants nothing)';

  -- ── grants: authenticated cannot call the helpers ──────────────────────
  v := pg_temp.wp09_as(free_org, 'authenticated', format('select public.org_effective_plan(%L)', pro_org));
  if v not like '%permission denied%' then raise exception 'FAIL grant: got %', v; end if;
  v := pg_temp.wp09_as(free_org, 'authenticated', format('select public.user_effective_plan(%L)', free_org));
  if v not like '%permission denied%' then raise exception 'FAIL grant user plan: got %', v; end if;
  raise notice 'PASS helpers not executable by authenticated';

  -- ── items: free org (new, default trial date) capped at 50 rows ───────
  v := pg_temp.wp09_as(free_org, 'authenticated', format(
    'insert into public.equipment_items (name, location, org_id) select ''C-Stand '' || g, ''Truck'', %L from generate_series(1,50) g', free_org));
  if v <> 'OK' then raise exception 'FAIL items 50 allowed: %', v; end if;
  v := pg_temp.wp09_as(free_org, 'authenticated', format(
    'insert into public.equipment_items (name, location, org_id) values (''51st'', ''Truck'', %L)', free_org));
  if v <> 'plan_limit:items | Plan limit: this organization''s plan allows up to 50 equipment items.' then
    raise exception 'FAIL items 51st: %', v; end if;
  -- updates and deletes of existing rows still work at the cap
  v := pg_temp.wp09_as(free_org, 'authenticated', format(
    'update public.equipment_items set quantity = 2 where org_id = %L', free_org));
  if v <> 'OK' then raise exception 'FAIL items update at cap: %', v; end if;
  v := pg_temp.wp09_as(free_org, 'authenticated', format(
    'delete from public.equipment_items where org_id = %L and name = ''C-Stand 50''', free_org));
  if v <> 'OK' then raise exception 'FAIL items delete at cap: %', v; end if;
  v := pg_temp.wp09_as(free_org, 'authenticated', format(
    'insert into public.equipment_items (name, location, org_id) values (''back to 50'', ''Truck'', %L)', free_org));
  if v <> 'OK' then raise exception 'FAIL items refill to 50: %', v; end if;
  -- a single 60-row statement into an empty free org fails as a whole
  delete from public.equipment_items where org_id = free_org;
  v := pg_temp.wp09_as(free_org, 'authenticated', format(
    'insert into public.equipment_items (name, location, org_id) select ''X'' || g, ''Truck'', %L from generate_series(1,60) g', free_org));
  if v not like 'plan_limit:items | Plan limit:%' then raise exception 'FAIL bulk 60: %', v; end if;
  if exists (select 1 from public.equipment_items where org_id = free_org) then
    raise exception 'FAIL bulk 60 left rows'; end if;
  -- lapsed / canceled / no-row / far-future-trial orgs are Free too
  for i in 1..4 loop
    v := pg_temp.wp09_as((array[lapsed_org, canceled_org, nosub_org, far_trial_org])[i], 'authenticated', format(
      'insert into public.equipment_items (name, location, org_id) select ''Z'' || g, ''Truck'', %L from generate_series(1,51) g',
      (array[lapsed_org, canceled_org, nosub_org, far_trial_org])[i]));
    if v not like 'plan_limit:items | %' then raise exception 'FAIL free-equivalent org % not capped: %', i, v; end if;
  end loop;
  -- postgres session (no JWT) is not limited
  insert into public.equipment_items (name, location, org_id)
    select 'seed ' || g, 'Truck', free_org from generate_series(1,55) g;
  raise notice 'PASS items cap (free, incl. default trial date, lapsed, canceled, no row)';

  -- pro / past_due / team / Stripe-trialing orgs are not item-capped
  for i in 1..4 loop
    v := pg_temp.wp09_as((array[pro_org, pd_org, team_org, stripe_trial_org])[i], 'authenticated', format(
      'insert into public.equipment_items (name, location, org_id) select ''Y'' || g, ''Truck'', %L from generate_series(1,55) g',
      (array[pro_org, pd_org, team_org, stripe_trial_org])[i]));
    if v <> 'OK' then raise exception 'FAIL items uncapped org %: %', i, v; end if;
  end loop;
  raise notice 'PASS items uncapped on pro/past_due/team/trialing';

  -- ── locations: free org capped at 1 active ────────────────────────────
  v := pg_temp.wp09_as(free_org, 'authenticated', format(
    'insert into public.locations (org_id, name) values (%L, ''Truck 1'')', free_org));
  if v <> 'OK' then raise exception 'FAIL loc 1st: %', v; end if;
  v := pg_temp.wp09_as(free_org, 'authenticated', format(
    'insert into public.locations (org_id, name) values (%L, ''Truck 2'')', free_org));
  if v <> 'plan_limit:locations | Plan limit: this organization''s plan allows 1 active location.' then
    raise exception 'FAIL loc 2nd: %', v; end if;
  -- inactive extra location is allowed; re-activating it is not
  v := pg_temp.wp09_as(free_org, 'authenticated', format(
    'insert into public.locations (org_id, name, is_active) values (%L, ''Stage'', false)', free_org));
  if v <> 'OK' then raise exception 'FAIL loc inactive insert: %', v; end if;
  v := pg_temp.wp09_as(free_org, 'authenticated', format(
    'update public.locations set is_active = true where org_id = %L and name = ''Stage''', free_org));
  if v not like 'plan_limit:locations | %' then raise exception 'FAIL loc reactivate: %', v; end if;
  -- renaming the active one is fine; deactivating it then activating the other is fine
  v := pg_temp.wp09_as(free_org, 'authenticated', format(
    'update public.locations set name = ''Truck A'' where org_id = %L and name = ''Truck 1''', free_org));
  if v <> 'OK' then raise exception 'FAIL loc rename: %', v; end if;
  v := pg_temp.wp09_as(free_org, 'authenticated', format(
    'update public.locations set is_active = false where org_id = %L and name = ''Truck A''', free_org));
  if v <> 'OK' then raise exception 'FAIL loc deactivate: %', v; end if;
  v := pg_temp.wp09_as(free_org, 'authenticated', format(
    'update public.locations set is_active = true where org_id = %L and name = ''Stage''', free_org));
  if v <> 'OK' then raise exception 'FAIL loc swap active: %', v; end if;
  v := pg_temp.wp09_as(pro_org, 'authenticated', format(
    'insert into public.locations (org_id, name) select %L, ''L'' || g from generate_series(1,3) g', pro_org));
  if v <> 'OK' then raise exception 'FAIL loc pro: %', v; end if;
  raise notice 'PASS locations cap';

  -- ── invites: free blocked; pro capped at 5 seats; team unlimited ─────
  -- Invites are written only by invite-staff with the service role (after
  -- WP03, authenticated has no INSERT on org_invites at all), so every
  -- invite below runs as service_role: the trigger must limit it anyway.
  v := pg_temp.wp09_as(free_org, 'service_role', format(
    'insert into public.org_invites (org_id, email, role) values (%L, ''a@x.test'', ''crew'') on conflict (org_id, email) do update set status = ''pending''', free_org));
  if v <> 'plan_limit:invites | Plan limit: this organization''s plan does not include staff invites.' then
    raise exception 'FAIL invite free: %', v; end if;
  -- a Free org whose trial_ends_at is years away is blocked too
  v := pg_temp.wp09_as(far_trial_org, 'service_role', format(
    'insert into public.org_invites (org_id, email, role) values (%L, ''a@x.test'', ''crew'')', far_trial_org));
  if v not like 'plan_limit:invites | %' then raise exception 'FAIL invite far-trial org: %', v; end if;

  -- pro: 1 active crew member + 4 pending = 5 seats
  insert into auth.users (id, email) values ('99000000-0000-0000-0000-0000000000c1', 'crew1@wp09.test');
  insert into public.organization_members (org_id, user_id, role)
    values (pro_org, '99000000-0000-0000-0000-0000000000c1', 'crew');
  for i in 1..4 loop
    v := pg_temp.wp09_as(pro_org, 'service_role', format(
      'insert into public.org_invites (org_id, email, role) values (%L, %L, ''crew'') on conflict (org_id, email) do update set status = ''pending''',
      pro_org, 'p' || i || '@x.test'));
    if v <> 'OK' then raise exception 'FAIL pro invite %: %', i, v; end if;
  end loop;
  -- re-send to an existing pending address (invite-staff upsert) is allowed
  v := pg_temp.wp09_as(pro_org, 'service_role', format(
    'insert into public.org_invites (org_id, email, role) values (%L, ''P1@x.test'', ''crew'') on conflict (org_id, email) do update set status = ''pending''', pro_org));
  if v <> 'OK' then raise exception 'FAIL pro re-send: %', v; end if;
  v := pg_temp.wp09_as(pro_org, 'service_role', format(
    'insert into public.org_invites (org_id, email, role) values (%L, ''p6@x.test'', ''crew'')', pro_org));
  if v <> 'plan_limit:seats | Plan limit: this organization''s plan allows up to 5 staff members.' then
    raise exception 'FAIL pro 6th seat: %', v; end if;
  -- past_due Pro keeps its seats (Decision 5)
  v := pg_temp.wp09_as(pd_org, 'service_role', format(
    'insert into public.org_invites (org_id, email, role) values (%L, ''pd1@x.test'', ''crew'')', pd_org));
  if v <> 'OK' then raise exception 'FAIL past_due invite: %', v; end if;
  for i in 1..7 loop
    v := pg_temp.wp09_as(team_org, 'service_role', format(
      'insert into public.org_invites (org_id, email, role) values (%L, %L, ''crew'')', team_org, 't' || i || '@x.test'));
    if v <> 'OK' then raise exception 'FAIL team invite %: %', i, v; end if;
  end loop;
  raise notice 'PASS invite seats';

  -- ── store-safe wording: no upgrade steering, prices or URLs ──────────
  for v in
    select unnest(array[
      pg_temp.wp09_as(free_org, 'authenticated', format(
        'insert into public.equipment_items (name, location, org_id) values (''n'', ''Truck'', %L)', free_org)),
      pg_temp.wp09_as(free_org, 'authenticated', format(
        'insert into public.locations (org_id, name) values (%L, ''Truck 9'')', free_org)),
      pg_temp.wp09_as(free_org, 'service_role', format(
        'insert into public.org_invites (org_id, email, role) values (%L, ''z@x.test'', ''crew'')', free_org)),
      pg_temp.wp09_as(pro_org, 'service_role', format(
        'insert into public.org_invites (org_id, email, role) values (%L, ''z@x.test'', ''crew'')', pro_org))])
  loop
    if split_part(v, ' | ', 2) not like 'Plan limit: %' then raise exception 'FAIL prefix: %', v; end if;
    if split_part(v, ' | ', 1) not like 'plan_limit:%' then raise exception 'FAIL hint: %', v; end if;
    if split_part(v, ' | ', 2) ~* '(upgrade|\$|https?:|www\.|pricing|billing|subscribe|\mpro\M|\mteam\M)' then
      raise exception 'FAIL store-unsafe wording: %', v; end if;
  end loop;
  raise notice 'PASS messages are neutral (Plan limit: prefix, plan_limit:* hint)';

  raise notice 'WP09 plan_limits: ALL PASS';
end $$;

rollback;
