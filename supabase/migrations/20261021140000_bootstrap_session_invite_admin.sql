-- WP14 (audit L7, L28) — bootstrap_session reports platform-admin status and
-- can skip auto-creating an org for users arriving from an invite link.
--
--   L7  GhostBar called is_platform_admin() on every page load for every
--       user. bootstrap_session already evaluates it; it now returns
--       'is_platform_admin' so the web app only mounts GhostBar for admins.
--   L28 Opening /invite-accept with no pending invite (revoked, or a
--       different email) still ran ensure_org_for_user(), which created a
--       "New Company" org and walked the invitee into org setup. The new
--       overload bootstrap_session(p_from_invite boolean) skips
--       ensure_org_for_user() when p_from_invite is true and no invite was
--       accepted; it then reports the caller's existing membership (or none).
--       It also returns 'invite_accepted'.
--
-- Backward compatibility: bootstrap_session() keeps its signature, grants and
-- response shape (two keys added) and now delegates to
-- bootstrap_session(false). Shipped mobile builds do not call it. The web
-- calls bootstrap_session(p_from_invite => true) only on /invite-accept and
-- falls back to bootstrap_session() on PGRST202.
--
-- The body below is the latest bootstrap_session() definition before this
-- migration (WP03 20261021030000 + WP04 20261021040400) with only these
-- deltas: (1) accept_org_invite_for_user()'s result captured into
-- v_accepted_org inside the existing exception block; (2) the
-- p_from_invite branch around ensure_org_for_user(); (3) v_is_admin computed
-- once and reused for the ghost check; (4) two keys, 'is_platform_admin' and
-- 'invite_accepted'.
--
-- Other WPs that redefine bootstrap_session: WP03, WP04 (before this). Any
-- later redefinition must edit bootstrap_session(boolean), not the wrapper.

create or replace function public.bootstrap_session(p_from_invite boolean)
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
  v_is_admin boolean := false;
  v_accepted_org uuid;
begin
  if v_uid is null then
    return null;
  end if;

  -- Invite linking must run before ensure_org_for_user, which would
  -- otherwise create a fresh org for a newly invited user. A failure here
  -- must never block login: log it and carry on with the user's current org.
  begin
    select a.accepted_org_id
      into v_accepted_org
      from public.accept_org_invite_for_user() a;
  exception when others then
    raise warning 'bootstrap_session: accept_org_invite_for_user failed for %: % (%)',
      v_uid, sqlerrm, sqlstate;
    v_accepted_org := null;
  end;

  if coalesce(p_from_invite, false) and v_accepted_org is null then
    -- L28: the user came from an invite link but no invite was accepted.
    -- Do not create a "New Company" org; report the existing membership,
    -- if any (organization_members_one_org_per_user: at most one row).
    select m.org_id, m.role
      into v_org_id, v_role
      from public.organization_members m
     where m.user_id = v_uid;
  else
    select e.org_id, e.role
      into v_org_id, v_role
    from public.ensure_org_for_user() e;
  end if;

  v_is_admin := coalesce(public.is_platform_admin(), false);

  -- Ghost override: a platform admin pointed at an org sees that org instead
  -- of their own. Role is reported as owner so the full UI is available;
  -- writes remain blocked by RLS unless write is armed (ghost_can_write).
  if v_is_admin and public.ghost_active_org() is not null then
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
    'is_platform_admin', v_is_admin,
    'invite_accepted', v_accepted_org is not null,
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

revoke all on function public.bootstrap_session(boolean) from public;
revoke all on function public.bootstrap_session(boolean) from anon;
grant execute on function public.bootstrap_session(boolean) to authenticated, service_role;

-- The original zero-argument RPC (web on every page load) is now a thin
-- wrapper, so there is one body to maintain.
create or replace function public.bootstrap_session()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return public.bootstrap_session(false);
end;
$$;

revoke all on function public.bootstrap_session() from public;
revoke all on function public.bootstrap_session() from anon;
grant execute on function public.bootstrap_session() to authenticated, service_role;
