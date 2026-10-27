-- pgTAP: WP26 Phase 3 pdf_templates. Shape validation, RLS by role and org,
-- counters only through record_pdf_template_use().
-- Run: supabase test db supabase/tests/database
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- ── fixtures (as postgres) ────────────────────────────────────────────────
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('26000000-0000-0000-0000-0000000000a1', 'wp26-owner-a@test.local', 'authenticated', 'authenticated', '{"full_name":"Owner A"}'),
  ('26000000-0000-0000-0000-0000000000a2', 'wp26-crew-a@test.local',  'authenticated', 'authenticated', '{"full_name":"Crew A"}'),
  ('26000000-0000-0000-0000-0000000000a3', 'wp26-head-a@test.local',  'authenticated', 'authenticated', '{"full_name":"Head A"}'),
  ('26000000-0000-0000-0000-0000000000b1', 'wp26-owner-b@test.local', 'authenticated', 'authenticated', '{"full_name":"Owner B"}');

insert into public.organizations (id, name) values
  ('26000000-0000-0000-0000-00000000000a', 'WP26 Org A'),
  ('26000000-0000-0000-0000-00000000000b', 'WP26 Org B');

insert into public.organization_members (org_id, user_id, role, status) values
  ('26000000-0000-0000-0000-00000000000a', '26000000-0000-0000-0000-0000000000a1', 'owner', 'active'),
  ('26000000-0000-0000-0000-00000000000a', '26000000-0000-0000-0000-0000000000a2', 'crew', 'active'),
  ('26000000-0000-0000-0000-00000000000a', '26000000-0000-0000-0000-0000000000a3', 'department_head', 'active'),
  ('26000000-0000-0000-0000-00000000000b', '26000000-0000-0000-0000-0000000000b1', 'owner', 'active');

-- A valid template (same shape templates.js produces).
create temp table t_tpl as select '{
  "version": 1,
  "fingerprint": {"tokens": ["CASCADE", "QTY"]},
  "table": {"start_after": "Item Description", "end_before": "Total items"},
  "columns": {"name": {"x_min": 0, "x_max": 213}, "quantity": {"x_min": 400, "x_max": 100000}},
  "skip": ["Subtotal"],
  "category_from": "none"
}'::jsonb as t;
grant select on t_tpl to authenticated;

-- ── shape validation ──────────────────────────────────────────────────────
select ok(public.pdf_template_is_valid((select t from t_tpl)), 'a taught template is valid');
select ok(not public.pdf_template_is_valid((select t from t_tpl) - 'columns'), 'missing columns is invalid');
select ok(not public.pdf_template_is_valid(jsonb_set((select t from t_tpl), '{fingerprint,tokens}', '["qty"]')),
  'lower-case fingerprint words are invalid');
select ok(not public.pdf_template_is_valid(jsonb_set((select t from t_tpl), '{columns,quantity,x_max}', '-1')),
  'an inverted column range is invalid');
select ok(not public.pdf_template_is_valid(jsonb_set((select t from t_tpl), '{category_from}', '"column"')),
  'category_from column without a category column is invalid');
select ok(not public.pdf_template_is_valid(jsonb_set((select t from t_tpl), '{skip}',
  (select jsonb_agg('x'::text) from generate_series(1, 21)))), 'more than 20 skip markers is invalid');

-- ── owner A writes; crew A cannot; owner B cannot see A's ──────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"26000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

insert into public.pdf_templates (id, org_id, name, template)
values ('26000000-0000-0000-0000-0000000000f1', '26000000-0000-0000-0000-00000000000a', 'Cascade', (select t from t_tpl));
select is((select created_by from public.pdf_templates where id = '26000000-0000-0000-0000-0000000000f1'),
  '26000000-0000-0000-0000-0000000000a1'::uuid, 'owner can save a template; created_by is the caller');

select throws_ok(
  $$ insert into public.pdf_templates (org_id, name, template)
     values ('26000000-0000-0000-0000-00000000000a', 'Broken', '{"version": 1}') $$,
  '23514', null, 'the database refuses an invalid template');

select throws_ok(
  $$ update public.pdf_templates set success_count = 99 where id = '26000000-0000-0000-0000-0000000000f1' $$,
  '42501', null, 'clients cannot write the counters');

set local request.jwt.claims = '{"sub":"26000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
update public.pdf_templates set name = 'Cascade Studio' where id = '26000000-0000-0000-0000-0000000000f1';
select is((select name from public.pdf_templates where id = '26000000-0000-0000-0000-0000000000f1'),
  'Cascade Studio', 'a department head can update the org template');

set local request.jwt.claims = '{"sub":"26000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select is((select count(*) from public.pdf_templates where org_id = '26000000-0000-0000-0000-00000000000a'),
  1::bigint, 'crew can read their org template');
select throws_ok(
  $$ insert into public.pdf_templates (org_id, name, template)
     values ('26000000-0000-0000-0000-00000000000a', 'Crew one', (select t from t_tpl)) $$,
  '42501', null, 'crew cannot save a template');
delete from public.pdf_templates where id = '26000000-0000-0000-0000-0000000000f1';
select is((select count(*) from public.pdf_templates where id = '26000000-0000-0000-0000-0000000000f1'),
  1::bigint, 'crew cannot delete it either');

set local request.jwt.claims = '{"sub":"26000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select is((select count(*) from public.pdf_templates), 0::bigint, 'another org cannot see it');
select public.record_pdf_template_use('26000000-0000-0000-0000-0000000000f1', true);

-- ── counters through the RPC ──────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"26000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select public.record_pdf_template_use('26000000-0000-0000-0000-0000000000f1', true);
select public.record_pdf_template_use('26000000-0000-0000-0000-0000000000f1', false);

reset role;
select is((select array[success_count, fail_count] from public.pdf_templates where id = '26000000-0000-0000-0000-0000000000f1'),
  array[1, 1], 'members count successes and failures; another org''s call changed nothing');
select ok(not has_function_privilege('anon', 'public.record_pdf_template_use(uuid, boolean)', 'execute'),
  'anon cannot record template use');

select * from finish();
rollback;
