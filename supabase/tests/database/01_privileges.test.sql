-- pgTAP: function EXECUTE grants, RPC signatures shipped mobile builds call,
-- and "RLS on for every table". Pure catalog checks, no fixtures.
-- Run: supabase test db supabase/tests/database
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Signatures that store builds (TestFlight 5 / Play internal) call by name.
-- A WP may ADD overloads; it must never drop or change these.
select has_function('public', 'increment_equipment_quantity',
  array['uuid', 'integer', 'text', 'timestamp with time zone'],
  'shipped mobile RPC increment_equipment_quantity(uuid,int,text,timestamptz) exists');
select has_function('public', 'log_damage_event',
  array['uuid', 'text', 'timestamp with time zone'],
  'shipped mobile RPC log_damage_event(uuid,text,timestamptz) exists');
select has_function('public', 'log_merge_event',
  array['uuid', 'uuid', 'integer', 'text', 'text', 'timestamp with time zone'],
  'shipped mobile RPC log_merge_event(uuid,uuid,int,text,text,timestamptz) exists');
select has_function('public', 'bootstrap_session', array[]::text[],
  'web RPC bootstrap_session() exists');

-- authenticated can call the client-facing RPCs
select ok(has_function_privilege('authenticated',
  'public.increment_equipment_quantity(uuid,integer,text,timestamptz)', 'execute'),
  'authenticated can execute increment_equipment_quantity');
select ok(has_function_privilege('authenticated',
  'public.log_damage_event(uuid,text,timestamptz)', 'execute'),
  'authenticated can execute log_damage_event');
select ok(has_function_privilege('authenticated',
  'public.log_merge_event(uuid,uuid,integer,text,text,timestamptz)', 'execute'),
  'authenticated can execute log_merge_event');
select ok(has_function_privilege('authenticated', 'public.bootstrap_session()', 'execute'),
  'authenticated can execute bootstrap_session');
select ok(has_function_privilege('authenticated', 'public.delete_my_account()', 'execute'),
  'authenticated can execute delete_my_account');

-- anon gets nothing on the definer RPCs (807e5a5)
select ok(not has_function_privilege('anon', 'public.bootstrap_session()', 'execute'),
  'anon cannot execute bootstrap_session');
select ok(not has_function_privilege('anon', 'public.delete_my_account()', 'execute'),
  'anon cannot execute delete_my_account');
select ok(not has_function_privilege('anon',
  'public.log_damage_event(uuid,text,timestamptz)', 'execute'),
  'anon cannot execute log_damage_event');
select ok(not has_function_privilege('anon',
  'public.log_merge_event(uuid,uuid,integer,text,text,timestamptz)', 'execute'),
  'anon cannot execute log_merge_event');
select ok(not has_function_privilege('anon', 'public.ghost_set_org(uuid)', 'execute'),
  'anon cannot execute ghost_set_org');
select ok(not has_function_privilege('anon', 'public.ghost_arm_write(integer)', 'execute'),
  'anon cannot execute ghost_arm_write');

-- internal definer helpers: no client may call them directly (807e5a5)
select ok(not has_function_privilege('authenticated', 'public.ensure_org_for_user()', 'execute'),
  'authenticated cannot execute ensure_org_for_user');
select ok(not has_function_privilege('authenticated', 'public.accept_org_invite_for_user()', 'execute'),
  'authenticated cannot execute accept_org_invite_for_user');

-- trigger functions: nobody but owner/service_role (triggers fire regardless)
select ok(not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute'),
  'authenticated cannot execute handle_new_user');
select ok(not has_function_privilege('authenticated', 'public.log_equipment_audit()', 'execute'),
  'authenticated cannot execute log_equipment_audit');
select ok(not has_function_privilege('authenticated', 'public.set_updated_at()', 'execute'),
  'authenticated cannot execute set_updated_at');
select ok(not has_function_privilege('authenticated', 'public.create_free_subscription()', 'execute'),
  'authenticated cannot execute create_free_subscription');
select ok(not has_function_privilege('authenticated', 'public.set_feedback_org()', 'execute'),
  'authenticated cannot execute set_feedback_org');

-- every table in public has RLS enabled
select is(
  (select array_agg(c.relname::text order by c.relname)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  null::text[],
  'every public table has RLS enabled');

-- no policy anywhere in public is a literal "true" (rls_policy_always_true lint)
select is(
  (select array_agg(tablename || '.' || policyname order by 1)
     from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') = 'true' or coalesce(with_check, '') = 'true')),
  null::text[],
  'no always-true RLS policy in public');

select * from finish();
rollback;
