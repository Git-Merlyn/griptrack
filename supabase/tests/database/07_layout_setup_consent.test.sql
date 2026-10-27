-- pgTAP: WP26 Phase 4, "Set up this layout for me" consent is recorded once per account.
-- Run: supabase test db supabase/tests/database
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email, aud, role) values
  ('26500000-0000-0000-0000-0000000000a1', 'wp26-5@test.local', 'authenticated', 'authenticated');

select is((select layout_setup_consent_at from public.profiles where id = '26500000-0000-0000-0000-0000000000a1'),
  null, 'a new account has not agreed yet');

set local role authenticated;
set local request.jwt.claims = '{"sub":"26500000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select isnt(public.record_layout_setup_consent(), null, 'agreeing records a date');

reset role;
update public.profiles set layout_setup_consent_at = '2026-01-01'::timestamptz
 where id = '26500000-0000-0000-0000-0000000000a1';
set local role authenticated;
set local request.jwt.claims = '{"sub":"26500000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is(public.record_layout_setup_consent(), '2026-01-01'::timestamptz, 'agreeing again keeps the first date');

reset role;
select ok(not has_function_privilege('anon', 'public.record_layout_setup_consent()', 'execute'), 'anon cannot call it');

select * from finish();
rollback;
