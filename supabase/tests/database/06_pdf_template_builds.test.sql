-- pgTAP: WP26 Phase 4 daily limit for "Set up this layout for me".
-- Run: supabase test db supabase/tests/database
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email, aud, role) values
  ('26400000-0000-0000-0000-0000000000a1', 'wp26-4-owner@test.local', 'authenticated', 'authenticated');
insert into public.organizations (id, name) values
  ('26400000-0000-0000-0000-00000000000a', 'WP26-4 Org A'),
  ('26400000-0000-0000-0000-00000000000b', 'WP26-4 Org B');

select is(
  (select array_agg(public.record_pdf_template_build('26400000-0000-0000-0000-00000000000a', '26400000-0000-0000-0000-0000000000a1'))
     from generate_series(1, 6)),
  array[true, true, true, true, true, false],
  'five builds per org, the sixth is refused');

select ok(public.record_pdf_template_build('26400000-0000-0000-0000-00000000000b', null),
  'another org has its own allowance');

update public.pdf_template_builds set created_at = now() - interval '25 hours'
 where org_id = '26400000-0000-0000-0000-00000000000a'
   and id = (select min(id) from public.pdf_template_builds where org_id = '26400000-0000-0000-0000-00000000000a');
select ok(public.record_pdf_template_build('26400000-0000-0000-0000-00000000000a', null),
  'a build older than 24 hours frees a slot');

select ok(not has_function_privilege('authenticated', 'public.record_pdf_template_build(uuid, uuid, integer)', 'execute'),
  'signed-in users cannot call it directly');
select ok(not has_table_privilege('authenticated', 'public.pdf_template_builds', 'select'),
  'signed-in users cannot read the build log');
select ok(has_function_privilege('service_role', 'public.record_pdf_template_build(uuid, uuid, integer)', 'execute'),
  'the edge function (service role) can');

select * from finish();
rollback;
