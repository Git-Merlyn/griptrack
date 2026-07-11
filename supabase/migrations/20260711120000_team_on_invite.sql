-- Team-on-invite: let an invite carry a target team so the invitee is placed
-- on that team the moment they accept, instead of always landing as "No team".
--
-- Before this, org_invites had no team column and accept_org_invite_for_user()
-- inserted the membership with team_id defaulting to NULL. The web invite form
-- already sent a teamId (silently dropped); mobile now sends the inviter's
-- active team. This wires that intent all the way through.

-- 1. Store the target team on the invite. ON DELETE SET NULL so deleting a team
--    downgrades any pending invite to "no team" rather than blocking the delete.
alter table public.org_invites
  add column if not exists team_id uuid references public.teams(id) on delete set null;

-- 2. Carry the invite's team onto the membership at accept time.
create or replace function public.accept_org_invite_for_user()
  returns table("accepted_org_id" uuid, "accepted_role" text)
  language plpgsql
  security definer
  set search_path to 'public'
  as $$
declare
  v_email text;
  v_org uuid;
  v_role text;
  v_team uuid;
begin
  -- Prefer canonical auth.users email, fallback to JWT email
  select lower(u.email)
  into v_email
  from auth.users u
  where u.id = auth.uid();

  v_email := lower(coalesce(v_email, auth.jwt() ->> 'email', ''));

  if v_email = '' then
    return;
  end if;

  -- Find newest pending invite
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

  -- Attach signed-in user to invited org, on the invite's team (may be NULL).
  -- On re-accept we only set the team when the invite actually specifies one,
  -- so an existing team assignment isn't clobbered back to NULL.
  insert into public.organization_members (org_id, user_id, role, status, team_id)
  values (v_org, auth.uid(), coalesce(v_role, 'staff'), 'active', v_team)
  on conflict (org_id, user_id) do update
    set role = excluded.role,
        status = 'active',
        team_id = coalesce(excluded.team_id, public.organization_members.team_id);

  -- Mark invite accepted
  update public.org_invites i
  set status = 'accepted',
      accepted_at = now()
  where i.org_id = v_org
    and lower(i.email) = v_email
    and i.status = 'pending';

  return query
  select v_org, coalesce(v_role, 'staff');
end;
$$;
