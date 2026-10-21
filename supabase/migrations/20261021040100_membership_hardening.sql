-- WP04 (audit L58, L60, L61) — organization_members hardening.
--
-- L58: status = 'disabled' was allowed by the CHECK but enforced by only a few
--      helpers/policies, and nothing in either app or any edge function ever
--      writes it (removal is a hard DELETE). Rather than half-enforce a state
--      nobody can reach, pin the column to 'active'. A future "deactivate
--      member" feature must (1) relax this CHECK and (2) add status = 'active'
--      to every membership subquery in the RLS policies, auth_org_id() and
--      ensure_org_for_user in the same migration.
-- L60: members_update_admin did not pin user_id/org_id, so an admin could
--      graft any auth user into the org by UPDATE. Clients only ever update
--      role and team_id, so lock the other columns with column grants.
--      ALSO (found while planning WP04): members_update_admin and the member
--      DELETE policy query organization_members from inside a policy ON
--      organization_members. Postgres rejects that at plan time with
--      42P17 "infinite recursion detected in policy", so every role change,
--      team assignment and member removal from web Staff and mobile
--      ManageMembers has been failing since 20260704204438_rls_hardening.
--      Both policies now call is_org_admin(org_id) instead (a function's
--      inner query is planned separately, so no recursion; it already checks
--      status = 'active' and role in owner/admin).
-- L61: an armed ghost could insert its own membership (role defaulted to
--      'owner') and become a permanent, visible member, and could update or
--      delete the owner's row. Ghosts never need to create memberships.

-- ── L58 ─────────────────────────────────────────────────────────────────────
alter table public.organization_members
  drop constraint organization_members_status_check;
alter table public.organization_members
  add constraint organization_members_status_check check (status = 'active');
comment on column public.organization_members.status is
  'Always ''active'' (CHECK). Removal is a hard DELETE. Re-introducing a disabled state requires enforcing status in every membership policy first (see 20261021040100_membership_hardening.sql).';

-- ── L60 ─────────────────────────────────────────────────────────────────────
revoke update on public.organization_members from anon, authenticated;
grant update (role, team_id) on public.organization_members to authenticated;

drop policy if exists members_update_admin on public.organization_members;
create policy members_update_admin on public.organization_members
  for update to authenticated
  using (role <> 'owner' and public.is_org_admin(org_id))
  with check (role <> 'owner' and public.is_org_admin(org_id));

drop policy if exists "org admins can remove members of their org" on public.organization_members;
create policy "org admins can remove members of their org" on public.organization_members
  for delete to authenticated
  using (role <> 'owner' and public.is_org_admin(org_id));

-- ── L61 ─────────────────────────────────────────────────────────────────────
alter table public.organization_members alter column role set default 'crew';

drop policy if exists "platform_admin_write_ins" on public.organization_members;

drop policy if exists "platform_admin_write_upd" on public.organization_members;
create policy "platform_admin_write_upd" on public.organization_members
  for update
  using (public.ghost_can_write(org_id) and role <> 'owner')
  with check (public.ghost_can_write(org_id) and role <> 'owner');

drop policy if exists "platform_admin_write_del" on public.organization_members;
create policy "platform_admin_write_del" on public.organization_members
  for delete
  using (public.ghost_can_write(org_id) and role <> 'owner');
