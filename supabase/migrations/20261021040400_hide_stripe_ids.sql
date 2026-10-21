-- WP04 (audit L68) — stop exposing Stripe ids to every org member.
--
-- bootstrap_session returned stripe_customer_id / stripe_subscription_id and
-- the "members can view subscription" policy let crew SELECT them. No client
-- reads them (the billing edge functions use the service role).
--   1. bootstrap_session: the two keys are replaced by has_stripe_customer
--      (boolean); nothing else changes.
--   2. subscriptions: authenticated gets column-level SELECT on the non-Stripe
--      columns only, and no write privileges (only service-role edge functions
--      and definer functions write this table).
-- DEPLOY ORDER: the web change narrowing UserProvider's subscriptions select
-- (commit "sec(web): narrow subscriptions select") must be live BEFORE this
-- migration is pushed — a SELECT naming a non-granted column fails with 42501
-- for the whole query.

-- Boolean stand-in for "this org has a Stripe customer" (billing UI needs to
-- know whether to offer the portal), readable without exposing the id.
alter table public.subscriptions
  add column if not exists has_stripe_customer boolean
  generated always as (stripe_customer_id is not null) stored;

create or replace function public.bootstrap_session()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_role text;
  v_ghost boolean := false;
  v_ghost_write boolean := false;
begin
  if v_uid is null then
    return null;
  end if;

  -- Invite linking must run before ensure_org_for_user, which would
  -- otherwise create a fresh org for a newly invited user. A failure here
  -- must never block login: log it and carry on with the user's current org.
  begin
    perform public.accept_org_invite_for_user();
  exception when others then
    raise warning 'bootstrap_session: accept_org_invite_for_user failed for %: % (%)',
      v_uid, sqlerrm, sqlstate;
  end;

  select e.org_id, e.role
    into v_org_id, v_role
  from public.ensure_org_for_user() e;

  -- Ghost override: a platform admin pointed at an org sees that org instead
  -- of their own. Role is reported as owner so the full UI is available;
  -- writes remain blocked by RLS unless write is armed (ghost_can_write).
  if public.is_platform_admin() and public.ghost_active_org() is not null then
    v_org_id := public.ghost_active_org();
    v_role := 'owner';
    v_ghost := true;
    v_ghost_write := public.ghost_can_write(v_org_id);
  end if;

  return jsonb_build_object(
    'org_id', v_org_id,
    'role', v_role,
    'ghost', v_ghost,
    'ghost_write', v_ghost_write,
    'org', (
      select jsonb_build_object(
        'name', o.name,
        'trial_ends_at', o.trial_ends_at,
        'features', o.features
      )
      from public.organizations o
      where o.id = v_org_id
    ),
    'subscription', (
      select jsonb_build_object(
        'plan', s.plan,
        'status', s.status,
        'current_period_end', s.current_period_end,
        'cancel_at_period_end', s.cancel_at_period_end,
        'has_stripe_customer', s.has_stripe_customer
      )
      from public.subscriptions s
      where s.org_id = v_org_id
    ),
    'team_id', (
      select m.team_id
      from public.organization_members m
      where m.org_id = v_org_id and m.user_id = v_uid
    ),
    'profile', (
      select jsonb_build_object(
        'id', p.id,
        'email', p.email,
        'full_name', p.full_name,
        'phone', p.phone
      )
      from public.profiles p
      where p.id = v_uid
    )
  );
end;
$$;

revoke all on public.subscriptions from anon;
revoke all on public.subscriptions from authenticated;
grant select (id, org_id, plan, status, current_period_end, cancel_at_period_end, has_stripe_customer, created_at, updated_at)
  on public.subscriptions to authenticated;
