-- WP25 (TODO 9.17) — sign-up role choice: "I run a team" / "I work on a team".
--
-- Until now every account got an organization on first sign-in:
-- bootstrap_session -> ensure_org_for_user() created a "New Company" org with
-- the user as owner whenever they had no membership and no pending invite.
-- Crew who only work on someone else's team ended up owning an empty
-- placeholder org.
--
--   1. profiles.signup_role ('owner' | 'crew' | null). Null = an account from
--      before this change; it keeps the old behaviour exactly.
--   2. handle_new_user() copies signup_role from the sign-up metadata
--      (supabase.auth.signUp options.data), ignoring any other value.
--   3. ensure_org_for_user() creates nothing for a 'crew' user with no
--      membership. Invites are still accepted first by bootstrap_session, so
--      an invited crew member lands in the inviting org.
--   4. bootstrap_session(boolean) also returns 'signup_role', so clients can
--      tell "waiting for an invite" from a failed bootstrap.
--   5. start_own_org(): "I run a team instead" from the waiting screen. Sets
--      signup_role = 'owner' and creates the org (or returns the existing
--      membership).
--
-- A user can update their own profile row, so they could change
-- signup_role themselves. That only decides whether their own first sign-in
-- creates an org for them.

alter table public.profiles
  add column if not exists signup_role text
  constraint profiles_signup_role_check check (signup_role in ('owner', 'crew'));

-- ── 2. handle_new_user (latest body: 20260711140000_new_user_full_name.sql) ──
-- Also runs on auth email change (20261021040300); the ON CONFLICT branch
-- keeps an existing signup_role.
create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  as $$
begin
  insert into public.profiles (id, email, full_name, signup_role)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    case
      when new.raw_user_meta_data ->> 'signup_role' in ('owner', 'crew')
        then new.raw_user_meta_data ->> 'signup_role'
    end
  )
  on conflict (id) do update
    set email = excluded.email,
        -- Only fill the name when we have one and the row doesn't already,
        -- so we never blank out a name that was set elsewhere.
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        signup_role = coalesce(public.profiles.signup_role, excluded.signup_role);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ── 3. ensure_org_for_user (latest body: 20260704152501_remote_schema.sql) ──
create or replace function public.ensure_org_for_user()
  returns table(org_id uuid, role text)
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  existing_org uuid;
  new_org uuid;
begin
  select m.org_id into existing_org
  from public.organization_members m
  where m.user_id = auth.uid()
  limit 1;

  if existing_org is not null then
    return query
    select existing_org, m.role
    from public.organization_members m
    where m.user_id = auth.uid()
      and m.org_id = existing_org;
    return;
  end if;

  -- WP25: crew wait for an invite instead of getting a placeholder org.
  if exists (select 1 from public.profiles p
              where p.id = auth.uid() and p.signup_role = 'crew') then
    return;
  end if;

  insert into public.organizations (name)
  values ('New Company')
  returning id into new_org;

  insert into public.organization_members (org_id, user_id, role, status)
  values (new_org, auth.uid(), 'owner', 'active');

  return query select new_org, 'owner';
end;
$$;

revoke execute on function public.ensure_org_for_user() from public, anon, authenticated;

-- ── 4. bootstrap_session(boolean) (latest body: 20261021140000) ─────────────
-- Only delta: the 'signup_role' key.
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
    'signup_role', (select p.signup_role from public.profiles p where p.id = v_uid),
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

-- ── 5. start_own_org ────────────────────────────────────────────────────────
create or replace function public.start_own_org()
  returns table(org_id uuid, role text)
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.profiles p
     set signup_role = 'owner'
   where p.id = auth.uid();

  return query select e.org_id, e.role from public.ensure_org_for_user() e;
end;
$$;

revoke all on function public.start_own_org() from public;
revoke all on function public.start_own_org() from anon;
grant execute on function public.start_own_org() to authenticated, service_role;
