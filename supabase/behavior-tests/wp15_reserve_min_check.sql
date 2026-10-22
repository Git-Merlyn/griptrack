-- WP15 behaviour test: reserve_min CHECK (audit L12).
-- Run: docker exec -i supabase_db_griptrack psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/behavior-tests/wp15_reserve_min_check.sql
-- Everything runs inside BEGIN ... ROLLBACK; nothing is left behind.
begin;

insert into public.organizations (id, name)
values ('00000000-0000-0000-0000-0000000015a1', 'WP15 Org');

-- 1) quantity 0 with a reserve minimum is still allowed
insert into public.equipment_items (org_id, name, location, quantity, reserve_min)
values ('00000000-0000-0000-0000-0000000015a1', 'Zero qty, reserve 2', 'Truck 1', 0, 2);

-- 2) a negative reserve_min is rejected
do $$
begin
  begin
    insert into public.equipment_items (org_id, name, location, quantity, reserve_min)
    values ('00000000-0000-0000-0000-0000000015a1', 'Negative reserve', 'Truck 1', 1, -1);
    raise exception 'FAIL: negative reserve_min was accepted';
  exception when check_violation then
    raise notice 'PASS: negative reserve_min rejected on insert';
  end;

  begin
    update public.equipment_items set reserve_min = -3
     where org_id = '00000000-0000-0000-0000-0000000015a1';
    raise exception 'FAIL: negative reserve_min was accepted on update';
  exception when check_violation then
    raise notice 'PASS: negative reserve_min rejected on update';
  end;
end $$;

-- 3) the constraint exists and is validated (raises, so CI fails loudly)
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'equipment_items_reserve_min_check' and convalidated
  ) then
    raise exception 'FAIL: equipment_items_reserve_min_check missing or not validated';
  end if;
  raise notice 'PASS: constraint validated';
end $$;

rollback;
