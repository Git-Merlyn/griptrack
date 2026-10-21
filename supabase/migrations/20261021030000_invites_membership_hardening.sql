-- WP03 — invites & membership hardening (audit H2, H3, H4, L62).
--
--   H2  An org admin could INSERT an org_invites row with role 'owner' straight
--       through PostgREST ("admins can manage invites" was FOR ALL) and become
--       owner on their next bootstrap. Clients now have SELECT plus a narrow
--       "revoke a pending invite" UPDATE on the status column only; all other
--       writes go through invite-staff (service role). org_invites.role gets a
--       CHECK that excludes 'owner', and accept_org_invite_for_user clamps the
--       role anyway.
--   H3  Accepting an invite overwrote an existing member's role (owner could be
--       demoted to crew). An existing membership is now never modified by an
--       invite; the invite is just marked accepted.
--   H4  Accepting an invite while already in another org raised a unique
--       violation out of bootstrap_session and broke login. Now: an untouched
--       placeholder org ("New Company", sole owner, no data, no Stripe ids) is
--       dissolved and the invite accepted; any other existing org keeps the
--       invite pending and returns quietly. bootstrap_session also swallows
--       any error from invite acceptance so no invite row can block login.
--   L62 org_invites.role default 'member' and the 'staff' fallbacks were never
--       valid roles. Default is now 'crew'.
--   H3  invite_sends: FK to organizations (cascade) so invitee emails do not
--       outlive the org; atomic record-then-check rate limit; 7-day retention.
--
-- Functions redefined here: accept_org_invite_for_user (no other WP redefines
-- it; WP14 reads its result), bootstrap_session (later also WP04 and WP14;
-- WP12 only calls it — each must start from the newest definition). New: is_disposable_placeholder_org,
-- invite_target_status, record_invite_send.

-- ── 1. org_invites data cleanup + role CHECK/default (L62, H2) ─────────────
-- A pending invite carrying role 'owner' can only have come from a direct
-- client insert (invite-staff always mapped owner -> admin): void it.
update public.org_invites
   set status = 'revoked'
 where role = 'owner'
   and status = 'pending';

update public.org_invites
   set role = 'crew'
 where role is null
    or role not in ('crew', 'department_head', 'admin');

alter table public.org_invites
  alter column role set default 'crew';

alter table public.org_invites
  add constraint org_invites_role_check
  check (role in ('crew', 'department_head', 'admin'));

-- ── 2. org_invites privileges + policies (H2) ──────────────────────────────
-- invite-staff writes with the service role (bypasses grants and RLS). Web
-- and mobile only SELECT pending invites, and (new in WP03) revoke one by
-- setting status = 'revoked'.
revoke all on table public.org_invites from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.org_invites from authenticated;
grant update (status) on table public.org_invites to authenticated;

drop policy if exists "admins can manage invites" on public.org_invites;

create policy "admins can read invites" on public.org_invites
  for select to authenticated
  using (org_id in (
    select m.org_id from public.organization_members m
     where m.user_id = (select auth.uid())
       and m.status = 'active'
       and m.role = any (array['owner'::text, 'admin'::text])
  ));

create policy "admins can revoke pending invites" on public.org_invites
  for update to authenticated
  using (
    status = 'pending'
    and org_id in (
      select m.org_id from public.organization_members m
       where m.user_id = (select auth.uid())
         and m.status = 'active'
         and m.role = any (array['owner'::text, 'admin'::text])
    )
  )
  with check (
    status = 'revoked'
    and org_id in (
      select m.org_id from public.organization_members m
       where m.user_id = (select auth.uid())
         and m.status = 'active'
         and m.role = any (array['owner'::text, 'admin'::text])
    )
  );

-- ── 3. invite_sends: FK + retention (H3) ───────────────────────────────────
delete from public.invite_sends s
 where not exists (select 1 from public.organizations o where o.id = s.org_id);

alter table public.invite_sends
  add constraint invite_sends_org_id_fkey
  foreign key (org_id) references public.organizations(id) on delete cascade;

-- ── 4. Placeholder-org detector (H4) ───────────────────────────────────────
-- True when p_org is an org that ensure_org_for_user auto-created for p_uid
-- and that was never used: placeholder name (same list as the web's
-- isPlaceholderOrgName), p_uid is its only member and its owner, no data rows
-- of any kind, and no Stripe customer/subscription.
create or replace function public.is_disposable_placeholder_org(p_org uuid, p_uid uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
as $$
  select exists (
    select 1
      from public.organizations o
     where o.id = p_org
       and lower(trim(coalesce(o.name, ''))) in ('', 'new company', 'default org', 'organization', 'company')
       and exists (select 1 from public.organization_members m
                    where m.org_id = o.id and m.user_id = p_uid and m.role = 'owner')
       and not exists (select 1 from public.organization_members m
                        where m.org_id = o.id and m.user_id <> p_uid)
       and not exists (select 1 from public.equipment_items x    where x.org_id = o.id)
       and not exists (select 1 from public.equipment_audit x    where x.org_id = o.id)
       and not exists (select 1 from public.equipment_requests x where x.org_id = o.id)
       and not exists (select 1 from public.locations x          where x.org_id = o.id)
       and not exists (select 1 from public.teams x              where x.org_id = o.id)
       and not exists (select 1 from public.productions x        where x.org_id = o.id)
       and not exists (select 1 from public.org_invites x        where x.org_id = o.id)
       and not exists (select 1 from public.subscriptions s
                        where s.org_id = o.id
                          and (s.stripe_customer_id is not null
                               or s.stripe_subscription_id is not null))
  );
$$;

revoke execute on function public.is_disposable_placeholder_org(uuid, uuid)
  from public, anon, authenticated;

-- ── 5. accept_org_invite_for_user (H2, H3, H4, L62) ────────────────────────
-- Based on 20260711120000_team_on_invite.sql (latest definition before WP03).
create or replace function public.accept_org_invite_for_user()
  returns table("accepted_org_id" uuid, "accepted_role" text)
  language plpgsql
  security definer
  set search_path to 'public'
  as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_org uuid;
  v_role text;
  v_team uuid;
  v_existing_org uuid;
  v_existing_role text;
begin
  if v_uid is null then
    return;
  end if;

  -- Prefer canonical auth.users email, fallback to JWT email
  select lower(u.email)
    into v_email
    from auth.users u
   where u.id = v_uid;

  v_email := lower(coalesce(v_email, auth.jwt() ->> 'email', ''));

  if v_email = '' then
    return;
  end if;

  -- Newest pending invite for this email
  select i.org_id, i.role, i.team_id
    into v_org, v_role, v_team
    from public.org_invites i
   where lower(i.email) = v_email
     and i.status = 'pending'
   order by i.created_at desc
   limit 1;

  if v_org is null then
    return;
  end if;

  -- Never trust the stored role: owner is not grantable by invite.
  if v_role is null or v_role not in ('crew', 'department_head', 'admin') then
    v_role := 'crew';
  end if;

  -- organization_members_one_org_per_user: at most one row per user.
  select m.org_id, m.role
    into v_existing_org, v_existing_role
    from public.organization_members m
   where m.user_id = v_uid;

  if v_existing_org is not null and v_existing_org <> v_org then
    if public.is_disposable_placeholder_org(v_existing_org, v_uid) then
      -- Untouched auto-created org: dissolve it so the invite can land.
      update public.beta_feedback set org_id = null where org_id = v_existing_org;
      delete from public.organizations where id = v_existing_org; -- cascades membership, subscription
      v_existing_org := null;
    else
      -- Real org elsewhere: one org per user. Leave the invite pending (the
      -- inviting admin can see and revoke it) and do not touch anything.
      return;
    end if;
  end if;

  if v_existing_org = v_org then
    -- Already a member: an invite never changes an existing membership
    -- (role, team or status). Role changes go through the Staff screen.
    v_role := v_existing_role;
  else
    begin
      insert into public.organization_members (org_id, user_id, role, status, team_id)
      values (v_org, v_uid, v_role, 'active', v_team);
    exception when unique_violation then
      -- Lost a race with another membership insert; leave the invite pending.
      return;
    end;
  end if;

  update public.org_invites i
     set status = 'accepted',
         accepted_at = now()
   where i.org_id = v_org
     and lower(i.email) = v_email
     and i.status = 'pending';

  return query select v_org, v_role;
end;
$$;

revoke execute on function public.accept_org_invite_for_user()
  from public, anon, authenticated;

-- ── 6. bootstrap_session: invite acceptance can never break login (H4) ────
-- Based on 20260711180000_ghost_bootstrap.sql (latest definition before
-- WP03). Only change: the accept call is wrapped in an exception block.
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
grant execute on function public.bootstrap_session() to authenticated, service_role;

-- ── 7. invite-staff helpers (service role only) ────────────────────────────
-- What would happen if p_email were invited to p_org:
--   'no_account'      no auth user with that email   -> send invite email
--   'no_org'          account, no membership         -> invite; accepted on next login
--   'member'          already in p_org               -> invite-staff returns 409
--   'placeholder_org' only in an untouched placeholder org -> invite; accept dissolves it
--   'other_org'       member of another real org     -> invite-staff returns { ok: true } (no signal); invite stays pending
create or replace function public.invite_target_status(p_org uuid, p_email text)
  returns text
  language plpgsql
  stable
  security definer
  set search_path to 'public'
as $$
declare
  v_uid uuid;
  v_member_org uuid;
begin
  select u.id into v_uid
    from auth.users u
   where lower(u.email) = lower(trim(p_email))
   order by u.created_at
   limit 1;

  if v_uid is null then
    return 'no_account';
  end if;

  select m.org_id into v_member_org
    from public.organization_members m
   where m.user_id = v_uid;

  if v_member_org is null then
    return 'no_org';
  elsif v_member_org = p_org then
    return 'member';
  elsif public.is_disposable_placeholder_org(v_member_org, v_uid) then
    return 'placeholder_org';
  end if;
  return 'other_org';
end;
$$;

revoke execute on function public.invite_target_status(uuid, text)
  from public, anon, authenticated;
grant execute on function public.invite_target_status(uuid, text) to service_role;

-- Atomic rate limit: serialise per org, prune old rows, count the last hour,
-- record this send only if under the limit. Returns false when the limit is hit.
create or replace function public.record_invite_send(
  p_org uuid,
  p_user uuid,
  p_email text,
  p_limit integer default 20
)
  returns boolean
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('invite_sends:' || p_org::text));

  delete from public.invite_sends where at < now() - interval '7 days';

  select count(*) into v_count
    from public.invite_sends
   where org_id = p_org
     and at >= now() - interval '1 hour';

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.invite_sends (org_id, user_id, email)
  values (p_org, p_user, lower(trim(p_email)));
  return true;
end;
$$;

revoke execute on function public.record_invite_send(uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.record_invite_send(uuid, uuid, text, integer) to service_role;
