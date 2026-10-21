-- Behavior test for public.delete_my_account() (WP08 / audit M21 + M22 regression).
-- Run AFTER the WP08 migration is applied locally (supabase migration up):
--   docker exec -i supabase_db_griptrack psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/behavior-tests/delete_my_account.sql
-- Everything runs inside BEGIN ... ROLLBACK; nothing persists.
-- Success = 17 "NOTICE:  PASS ..." lines, then the last line printed is
-- "NOTICE:  WP08 delete_my_account: ALL PASS", and psql exits 0 (\set QUIET on
-- suppresses the ROLLBACK tag). Any failed assert aborts with "ERROR:  FAIL ..."
-- and exit code 3.

\set QUIET on
begin;

-- Calls the RPC as an authenticated user (or anonymously when p_uid is null)
-- and returns 'OK' or the raised error message. Runs as postgres otherwise.
create function pg_temp.wp08_call(p_uid uuid) returns text
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.delete_my_account();
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    return 'OK';
  exception when others then
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    return sqlerrm;
  end;
end $$;

-- One owner + org (+ optional subscription state) per case.
create function pg_temp.wp08_owner(p_uid uuid, p_org uuid, p_status text,
  p_plan text, p_stripe_sub text) returns void
language plpgsql as $$
begin
  insert into auth.users (id, email) values (p_uid, p_uid::text || '@wp08.test');
  insert into public.organizations (id, name) values (p_org, 'WP08 ' || p_status);
  -- on_org_created inserted the default free row; overwrite it.
  update public.subscriptions
     set status = p_status, plan = p_plan,
         stripe_subscription_id = p_stripe_sub,
         stripe_customer_id = case when p_stripe_sub is null then null else 'cus_wp08' end
   where org_id = p_org;
  insert into public.organization_members (org_id, user_id, role)
    values (p_org, p_uid, 'owner');
end $$;

do $$
declare
  r record;
  v text;
begin
  -- ── M21: every non-terminal Stripe status must refuse ───────────────────
  for r in select * from (values
      ('11111111-0000-0000-0000-000000000001'::uuid, 'active',     'pro'),
      ('11111111-0000-0000-0000-000000000002'::uuid, 'trialing',   'team'),
      ('11111111-0000-0000-0000-000000000003'::uuid, 'past_due',   'pro'),
      ('11111111-0000-0000-0000-000000000004'::uuid, 'unpaid',     'pro'),
      ('11111111-0000-0000-0000-000000000005'::uuid, 'incomplete', 'pro'),
      ('11111111-0000-0000-0000-000000000006'::uuid, 'paused',     'team'),
      -- plan already 'free' but the Stripe sub is still past_due: still refuse
      ('11111111-0000-0000-0000-000000000007'::uuid, 'past_due',   'free')
    ) t(uid, status, plan)
  loop
    perform pg_temp.wp08_owner(r.uid, r.uid, r.status, r.plan, 'sub_' || r.status);
    v := pg_temp.wp08_call(r.uid);
    if v not like 'You have a paid subscription that is still active or awaiting payment%' then
      raise exception 'FAIL M21 status=% plan=%: expected billing refusal, got: %', r.status, r.plan, v;
    end if;
    if not exists (select 1 from auth.users where id = r.uid)
       or not exists (select 1 from public.organizations where id = r.uid)
       or not exists (select 1 from public.subscriptions where org_id = r.uid and stripe_subscription_id is not null) then
      raise exception 'FAIL M21 status=%: refused call still deleted data', r.status;
    end if;
    raise notice 'PASS M21 refuse status=% plan=%', r.status, r.plan;
  end loop;

  -- ── Terminal / no-Stripe states must allow, and delete everything ──────
  for r in select * from (values
      ('22222222-0000-0000-0000-000000000001'::uuid, 'canceled',           'free', 'sub_x'),
      ('22222222-0000-0000-0000-000000000002'::uuid, 'incomplete_expired', 'pro',  'sub_y'),
      ('22222222-0000-0000-0000-000000000003'::uuid, 'active',             'free', null),
      -- comped plan with no Stripe subscription: nothing can bill, so allow
      ('22222222-0000-0000-0000-000000000004'::uuid, 'active',             'team', null)
    ) t(uid, status, plan, stripe_sub)
  loop
    perform pg_temp.wp08_owner(r.uid, r.uid, r.status, r.plan, r.stripe_sub);
    insert into public.equipment_items (name, location, org_id)
      values ('WP08 item', 'Truck', r.uid);
    v := pg_temp.wp08_call(r.uid);
    if v <> 'OK' then
      raise exception 'FAIL allow status=% plan=% sub=%: got: %', r.status, r.plan, r.stripe_sub, v;
    end if;
    if exists (select 1 from auth.users where id = r.uid)
       or exists (select 1 from public.profiles where id = r.uid)
       or exists (select 1 from public.organizations where id = r.uid)
       or exists (select 1 from public.subscriptions where org_id = r.uid)
       or exists (select 1 from public.equipment_items where org_id = r.uid) then
      raise exception 'FAIL allow status=%: data left behind', r.status;
    end if;
    raise notice 'PASS allow status=% plan=% stripe_sub=%', r.status, r.plan, coalesce(r.stripe_sub, 'null');
  end loop;

  -- ── Remaining-members guard (M22 regression: message text the edge fn mirrors) ──
  perform pg_temp.wp08_owner('33333333-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001',
                             'past_due', 'pro', 'sub_team');
  insert into auth.users (id, email) values ('33333333-0000-0000-0000-000000000002', 'crew@wp08.test');
  insert into public.organization_members (org_id, user_id, role)
    values ('33333333-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000002', 'crew');

  v := pg_temp.wp08_call('33333333-0000-0000-0000-000000000001');
  if v <> 'Your organization still has 1 other member(s). Remove them from Staff (or transfer ownership) before deleting your account.' then
    raise exception 'FAIL members guard: got: %', v;
  end if;
  raise notice 'PASS owner with 1 other member refused (members guard runs before billing guard)';

  -- Non-owner deletes only themselves, even when the org's sub is past_due.
  v := pg_temp.wp08_call('33333333-0000-0000-0000-000000000002');
  if v <> 'OK' then
    raise exception 'FAIL non-owner delete: got: %', v;
  end if;
  if exists (select 1 from auth.users where id = '33333333-0000-0000-0000-000000000002')
     or not exists (select 1 from public.organizations where id = '33333333-0000-0000-0000-000000000001')
     or not exists (select 1 from public.subscriptions where org_id = '33333333-0000-0000-0000-000000000001' and status = 'past_due') then
    raise exception 'FAIL non-owner delete: wrong rows removed';
  end if;
  raise notice 'PASS non-owner deleted only themselves';

  -- Owner is now alone but the sub is past_due: billing guard refuses.
  v := pg_temp.wp08_call('33333333-0000-0000-0000-000000000001');
  if v not like 'You have a paid subscription that is still active or awaiting payment%' then
    raise exception 'FAIL owner-now-alone past_due: got: %', v;
  end if;
  raise notice 'PASS owner alone + past_due refused';

  -- What the edge function does after cancelling in Stripe (Decision 1 = A):
  update public.subscriptions
     set status = 'canceled', plan = 'free', cancel_at_period_end = false,
         stripe_subscription_id = null, stripe_customer_id = null
   where org_id = '33333333-0000-0000-0000-000000000001';
  v := pg_temp.wp08_call('33333333-0000-0000-0000-000000000001');
  if v <> 'OK' then
    raise exception 'FAIL owner after edge-fn sync: got: %', v;
  end if;
  raise notice 'PASS owner deleted after edge-fn sync';

  -- ── Unauthenticated ─────────────────────────────────────────────────────
  v := pg_temp.wp08_call(null);
  if v <> 'Not authenticated' then
    raise exception 'FAIL unauthenticated: got: %', v;
  end if;
  raise notice 'PASS unauthenticated refused';

  -- ── Grants unchanged ────────────────────────────────────────────────────
  if has_function_privilege('anon', 'public.delete_my_account()', 'execute') then
    raise exception 'FAIL anon can execute delete_my_account';
  end if;
  if not has_function_privilege('authenticated', 'public.delete_my_account()', 'execute') then
    raise exception 'FAIL authenticated cannot execute delete_my_account';
  end if;
  raise notice 'PASS grants';

  raise notice 'WP08 delete_my_account: ALL PASS';
end $$;

rollback;
