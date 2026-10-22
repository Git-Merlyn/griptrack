-- WP13: the RLS facts that the client role gates mirror (shared/roles.ts).
-- Read-only behaviour check: runs inside BEGIN ... ROLLBACK, creates its own
-- fixtures, and raises 'FAIL <id>: ...' on the first mismatch.
-- Run: docker exec -i supabase_db_griptrack psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/wp13_role_gates.sql
BEGIN;

insert into auth.users (id, email, instance_id, aud, role) values
  ('00000000-0000-0000-0000-0000000013a1','o@wp13.test','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('00000000-0000-0000-0000-0000000013a2','d@wp13.test','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('00000000-0000-0000-0000-0000000013a3','c@wp13.test','00000000-0000-0000-0000-000000000000','authenticated','authenticated');
insert into public.organizations (id, name, features) values
  ('00000000-0000-0000-0000-0000000013b1','WP13 Org','{"teams_enabled": true, "requests_enabled": true}');
insert into public.teams (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000013c1','00000000-0000-0000-0000-0000000013b1','Grip');
insert into public.organization_members (org_id, user_id, role, team_id) values
  ('00000000-0000-0000-0000-0000000013b1','00000000-0000-0000-0000-0000000013a1','owner',null),
  ('00000000-0000-0000-0000-0000000013b1','00000000-0000-0000-0000-0000000013a2','department_head','00000000-0000-0000-0000-0000000013c1'),
  ('00000000-0000-0000-0000-0000000013b1','00000000-0000-0000-0000-0000000013a3','crew','00000000-0000-0000-0000-0000000013c1');
insert into public.locations (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000013d1','00000000-0000-0000-0000-0000000013b1','Truck 1');
insert into public.equipment_requests (id, org_id, requested_by, requester_name, item_name) values
  ('00000000-0000-0000-0000-0000000013e1','00000000-0000-0000-0000-0000000013b1','00000000-0000-0000-0000-0000000013a3','C','C-stand');

create temp table wp13_result (check_name text primary key, rows_affected int) on commit drop;
grant all on wp13_result to authenticated;

-- ── As the department head ──────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000013a2","role":"authenticated"}';

with u as (update public.equipment_requests set status = 'approved', reviewed_by = 'D', reviewed_at = now()
           where id = '00000000-0000-0000-0000-0000000013e1' returning 1)
insert into wp13_result select 'M12 dept head reviews request', count(*) from u;
with u as (delete from public.locations where id = '00000000-0000-0000-0000-0000000013d1' returning 1)
insert into wp13_result select 'L40 dept head deletes location', count(*) from u;
with u as (update public.locations set name = 'Truck 1A' where id = '00000000-0000-0000-0000-0000000013d1' returning 1)
insert into wp13_result select 'L40 dept head renames location', count(*) from u;
with u as (update public.teams set status = 'archived' where id = '00000000-0000-0000-0000-0000000013c1' returning 1)
insert into wp13_result select 'L24 dept head archives team', count(*) from u;
with u as (delete from public.teams where id = '00000000-0000-0000-0000-0000000013c1' returning 1)
insert into wp13_result select 'L24 dept head deletes team', count(*) from u;

-- ── As the owner ────────────────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000013a1","role":"authenticated"}';

with u as (update public.equipment_requests set status = 'approved', reviewed_by = 'O', reviewed_at = now()
           where id = '00000000-0000-0000-0000-0000000013e1' returning 1)
insert into wp13_result select 'M12 owner reviews request', count(*) from u;
with u as (update public.teams set status = 'archived' where id = '00000000-0000-0000-0000-0000000013c1' returning 1)
insert into wp13_result select 'L24 owner archives team', count(*) from u;

reset role;

do $$
declare
  expected constant jsonb := '{
    "M12 dept head reviews request": 0,
    "M12 owner reviews request": 1,
    "L40 dept head deletes location": 0,
    "L40 dept head renames location": 1,
    "L24 dept head archives team": 0,
    "L24 dept head deletes team": 0,
    "L24 owner archives team": 1
  }';
  r record;
begin
  for r in select * from wp13_result order by check_name loop
    if (expected ->> r.check_name)::int is distinct from r.rows_affected then
      raise exception 'FAIL %: expected % row(s), got %', r.check_name, expected ->> r.check_name, r.rows_affected;
    end if;
    raise notice 'PASS %', r.check_name;
  end loop;
  if (select count(*) from wp13_result) <> 7 then
    raise exception 'FAIL: expected 7 checks, ran %', (select count(*) from wp13_result);
  end if;
end $$;

ROLLBACK;
