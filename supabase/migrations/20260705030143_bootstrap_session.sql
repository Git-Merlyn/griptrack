-- bootstrap_session(): the entire login-time bootstrap in ONE round trip.
--
-- The web app previously made six serial requests on every load (invite
-- acceptance, org ensure, org row, subscription, team assignment, profile),
-- costing 1.5-2.5s of loading screen on typical connections. This function
-- composes the existing SECURITY DEFINER RPCs and returns everything the
-- client needs as a single jsonb payload.

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
begin
  if v_uid is null then
    return null;
  end if;

  -- Invite linking must run before ensure_org_for_user, which would
  -- otherwise create a fresh org for a newly invited user.
  perform public.accept_org_invite_for_user();

  select e.org_id, e.role
    into v_org_id, v_role
  from public.ensure_org_for_user() e;

  return jsonb_build_object(
    'org_id', v_org_id,
    'role', v_role,
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
        'stripe_customer_id', s.stripe_customer_id,
        'stripe_subscription_id', s.stripe_subscription_id
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

-- Signed-in users only.
revoke all on function public.bootstrap_session() from public;
revoke all on function public.bootstrap_session() from anon;
grant execute on function public.bootstrap_session() to authenticated;
