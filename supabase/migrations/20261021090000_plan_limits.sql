-- WP09 (Option A, revised 2026-10-21) / audit M9: enforce the advertised plan
-- limits server-side.
--
-- Effective plan (mirrored in src/lib/plan.js -> computeEffectivePlan):
--   subscriptions.plan in (pro, team) and status in (active, trialing,
--   past_due) -> that plan; anything else -> 'free'.
-- There is NO org-level trial: organizations.trial_ends_at grants nothing.
-- The only trial is Stripe Checkout's 14-day, card-required trial, which
-- shows up here as status 'trialing'.
--
-- Free (PricingPage "Free" column): 50 equipment rows, 1 active location, no
-- staff invites. Pro: owner + 5 staff (active non-owner members + pending
-- invites). Team: unlimited.
--
-- Every write that arrives through the API (any JWT: authenticated, or
-- service_role from an edge function such as invite-staff) is limited.
-- Direct postgres sessions with no JWT (migrations, seeds, SQL-editor support
-- fixes) are not.
--
-- Messages are shown verbatim inside the iOS/Android apps, so they are
-- neutral: no upgrade wording, prices or URLs (App Store 3.1.1/3.1.3, Google
-- Play payments policy). Every message starts with 'Plan limit: ' and the
-- HINT carries the machine-readable code 'plan_limit:<name>'. The web adds
-- its own upgrade call-to-action client-side (src/lib/plan.js).
--
-- Backward compatibility: no RPC or table signature changes. An over-limit
-- insert fails with SQLSTATE P0001 (PostgREST HTTP 400).

create or replace function public.org_effective_plan(p_org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when s.plan in ('pro', 'team')
         and s.status in ('active', 'trialing', 'past_due') then s.plan
    else 'free'
  end
  from public.organizations o
  left join public.subscriptions s on s.org_id = o.id
  where o.id = p_org;
$$;

-- Effective plan of the org a user acts on ('free' if none). Mirrors
-- bootstrap_session: a platform admin pointed at an org (ghost, armed or
-- not) acts on THAT org; everyone else on the org they actively belong to.
-- organization_members has UNIQUE(user_id), so there is at most one row.
create or replace function public.user_effective_plan(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select public.org_effective_plan(s.active_org_id)
       from public.platform_admin_state s
       join public.platform_admins pa on pa.user_id = s.user_id
      where s.user_id = p_user
        and s.active_org_id is not null),
    (select public.org_effective_plan(m.org_id)
       from public.organization_members m
      where m.user_id = p_user and m.status = 'active'
      limit 1),
    'free');
$$;

create or replace function public.enforce_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan  text;
  v_count integer;
begin
  -- No JWT = direct postgres session (migration, seed, support fix): skip.
  -- Any API write (authenticated, or service_role from invite-staff) is limited.
  if auth.role() is null then
    return new;
  end if;
  if new.org_id is null then
    return new;  -- RLS rejects org-less rows anyway
  end if;

  v_plan := coalesce(public.org_effective_plan(new.org_id), 'free');
  if v_plan = 'team' then
    return new;
  end if;

  if tg_table_name = 'equipment_items' then
    if v_plan <> 'free' then
      return new;
    end if;
    perform pg_advisory_xact_lock(hashtextextended('gt_plan_items:' || new.org_id::text, 0));
    select count(*) into v_count
      from public.equipment_items
     where org_id = new.org_id;
    if v_count >= 50 then
      raise exception using
        errcode = 'P0001',
        message = 'Plan limit: this organization''s plan allows up to 50 equipment items.',
        hint    = 'plan_limit:items';
    end if;

  elsif tg_table_name = 'locations' then
    if v_plan <> 'free' or not new.is_active then
      return new;
    end if;
    if tg_op = 'UPDATE' and old.is_active then
      return new;  -- renaming an already-active location is fine
    end if;
    perform pg_advisory_xact_lock(hashtextextended('gt_plan_locations:' || new.org_id::text, 0));
    select count(*) into v_count
      from public.locations
     where org_id = new.org_id
       and is_active
       and id <> new.id;
    if v_count >= 1 then
      raise exception using
        errcode = 'P0001',
        message = 'Plan limit: this organization''s plan allows 1 active location.',
        hint    = 'plan_limit:locations';
    end if;

  elsif tg_table_name = 'org_invites' then
    if new.status is distinct from 'pending' then
      return new;
    end if;
    if v_plan = 'free' then
      raise exception using
        errcode = 'P0001',
        message = 'Plan limit: this organization''s plan does not include staff invites.',
        hint    = 'plan_limit:invites';
    end if;
    -- v_plan = 'pro': owner + 5 staff. Seats = active non-owner members +
    -- pending invites to OTHER addresses (a re-send to the same address is
    -- an upsert on (org_id, email) and must not count twice).
    perform pg_advisory_xact_lock(hashtextextended('gt_plan_seats:' || new.org_id::text, 0));
    select
      (select count(*) from public.organization_members m
        where m.org_id = new.org_id and m.status = 'active' and m.role <> 'owner')
      +
      (select count(*) from public.org_invites i
        where i.org_id = new.org_id and i.status = 'pending'
          and lower(i.email) <> lower(new.email))
      into v_count;
    if v_count >= 5 then
      raise exception using
        errcode = 'P0001',
        message = 'Plan limit: this organization''s plan allows up to 5 staff members.',
        hint    = 'plan_limit:seats';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_plan_limits_items on public.equipment_items;
create trigger enforce_plan_limits_items
  before insert on public.equipment_items
  for each row execute function public.enforce_plan_limits();

drop trigger if exists enforce_plan_limits_locations on public.locations;
create trigger enforce_plan_limits_locations
  before insert or update of is_active on public.locations
  for each row execute function public.enforce_plan_limits();

drop trigger if exists enforce_plan_limits_invites on public.org_invites;
create trigger enforce_plan_limits_invites
  before insert on public.org_invites
  for each row execute function public.enforce_plan_limits();

-- Grants: helpers are for triggers and edge functions (service_role) only.
revoke execute on function public.org_effective_plan(uuid)  from public, anon, authenticated;
revoke execute on function public.user_effective_plan(uuid) from public, anon, authenticated;
revoke execute on function public.enforce_plan_limits()     from public, anon, authenticated;
grant  execute on function public.org_effective_plan(uuid)  to service_role;
grant  execute on function public.user_effective_plan(uuid) to service_role;

-- organizations.trial_ends_at stays (bootstrap_session still returns it and
-- shipped builds may read it) but no longer means anything.
comment on column public.organizations.trial_ends_at is
  'Unused since WP09 (2026-10): there is no org-level trial and this date grants no plan. '
  'The only trial is the Stripe Checkout trial (subscriptions.status = trialing).';
