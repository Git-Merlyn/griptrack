-- Make the session bootstrap ghost-aware, and give admins a way to list orgs
-- to ghost into. With this, both web and mobile automatically render the
-- ghosted org for all reads (they both call bootstrap_session), and because
-- ghost state is server-side per user, setting it on one client is reflected
-- on the other.

-- List orgs for the ghost picker. Platform admins only.
create or replace function public.ghost_list_orgs()
  returns table (id uuid, name text, members bigint, equipment bigint)
  language plpgsql
  stable
  security definer
  set search_path to 'public'
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin' using errcode = '42501';
  end if;
  return query
    select o.id,
           o.name,
           (select count(*) from public.organization_members m where m.org_id = o.id),
           (select count(*) from public.equipment_items e where e.org_id = o.id)
    from public.organizations o
    order by o.name;
end;
$$;

grant execute on function public.ghost_list_orgs() to authenticated;

-- Ghost-aware bootstrap: when the caller is a platform admin with an active
-- ghost org, report THAT org (read-only unless they've armed write — RLS still
-- enforces that). Non-admins are completely unaffected.
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
  -- otherwise create a fresh org for a newly invited user.
  perform public.accept_org_invite_for_user();

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

revoke all on function public.bootstrap_session() from public;
revoke all on function public.bootstrap_session() from anon;
grant execute on function public.bootstrap_session() to authenticated;
