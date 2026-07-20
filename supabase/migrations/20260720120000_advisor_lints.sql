-- Fixes for the Supabase dashboard advisor lints (security + performance).
--
--   1. function_search_path_mutable: pin the four remaining functions the
--      earlier pass skipped (they're SECURITY INVOKER, so this is pure lint
--      hygiene, but it silences the warning class completely).
--   2. auth_rls_initplan: every policy that called auth.uid() /
--      is_platform_admin() / ghost_active_org() bare had it re-evaluated PER
--      ROW. Wrapping in (select ...) turns each into a one-time initplan.
--      Policies below were machine-generated from pg_policies with ONLY that
--      wrap applied — logic is otherwise byte-identical. (Policies using
--      column-argument helpers like is_active_member(org_id) can't be hoisted
--      and are unchanged.)
--   3. unindexed_foreign_keys + missing hot-path indexes: equipment_items and
--      equipment_audit had NO org_id index despite every query filtering on
--      it; equipment_audit also lacked an equipment_id index for the per-item
--      History view. Composites lead with the filter column and include the
--      sort key used by the History views.
--   4. extension_in_public: pg_trgm is installed but nothing references it
--      (no index uses its operator classes) — dropped outright.
--
-- Intentionally NOT "fixed" (flagged by the linter, correct by design):
--   * rls_enabled_no_policy on invite_sends / platform_admins /
--     platform_admin_state / platform_admin_audit — deny-all on purpose;
--     these are service-role/RPC-only tables.
--   * multiple_permissive_policies — the teams-on/teams-off/ghost policy
--     families are additive by design; with the initplan wraps each extra
--     policy costs one cached subplan, not a per-row hit.

-- ── 1. Pin remaining search_paths ────────────────────────────────────────────
alter function public.increment_equipment_quantity(uuid, integer, text, timestamptz) set search_path = public;
alter function public.is_active_member(uuid) set search_path = public;
alter function public.is_org_admin(uuid) set search_path = public;
alter function public.reset_test_user(text) set search_path = public;

-- ── 2. Initplan-wrapped policy rewrites (generated from pg_policies) ─────────
drop policy "org members can read audit records" on public.equipment_audit;
create policy "org members can read audit records" on public.equipment_audit
  for select
  using ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));

drop policy platform_admin_read on public.equipment_audit;
create policy platform_admin_read on public.equipment_audit
  for select
  using (((select public.is_platform_admin()) AND (org_id = (select public.ghost_active_org()))));

drop policy "equipment delete by role" on public.equipment_items;
create policy "equipment delete by role" on public.equipment_items
  for delete
  using ((org_id IN ( SELECT om.org_id
   FROM organization_members om
  WHERE ((om.user_id = (select auth.uid())) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

drop policy "equipment insert (teams off)" on public.equipment_items;
create policy "equipment insert (teams off)" on public.equipment_items
  for insert to authenticated
  with check (((NOT org_teams_enabled(org_id)) AND (org_id IN ( SELECT om.org_id
   FROM organization_members om
  WHERE ((om.user_id = (select auth.uid())) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text, 'department_head'::text])))))));

drop policy "equipment insert by role" on public.equipment_items;
create policy "equipment insert by role" on public.equipment_items
  for insert
  with check ((org_id IN ( SELECT om.org_id
   FROM organization_members om
  WHERE ((om.user_id = (select auth.uid())) AND ((om.role = ANY (ARRAY['owner'::text, 'admin'::text])) OR ((om.role = 'department_head'::text) AND (om.team_id = equipment_items.team_id)))))));

drop policy "equipment read by role" on public.equipment_items;
create policy "equipment read by role" on public.equipment_items
  for select
  using ((org_id IN ( SELECT om.org_id
   FROM organization_members om
  WHERE ((om.user_id = (select auth.uid())) AND ((om.role = ANY (ARRAY['owner'::text, 'admin'::text])) OR ((om.role = ANY (ARRAY['crew'::text, 'department_head'::text])) AND (om.team_id = equipment_items.team_id)))))));

drop policy "equipment update by role" on public.equipment_items;
create policy "equipment update by role" on public.equipment_items
  for update
  using ((org_id IN ( SELECT om.org_id
   FROM organization_members om
  WHERE ((om.user_id = (select auth.uid())) AND ((om.role = ANY (ARRAY['owner'::text, 'admin'::text])) OR ((om.role = ANY (ARRAY['department_head'::text, 'crew'::text])) AND (om.team_id = equipment_items.team_id)))))));

drop policy platform_admin_read on public.equipment_items;
create policy platform_admin_read on public.equipment_items
  for select
  using (((select public.is_platform_admin()) AND (org_id = (select public.ghost_active_org()))));

drop policy "admins can review requests" on public.equipment_requests;
create policy "admins can review requests" on public.equipment_requests
  for update
  using ((org_id IN ( SELECT om.org_id
   FROM organization_members om
  WHERE ((om.user_id = (select auth.uid())) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text]))))))
  with check ((org_id IN ( SELECT om.org_id
   FROM organization_members om
  WHERE ((om.user_id = (select auth.uid())) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

drop policy platform_admin_read on public.equipment_requests;
create policy platform_admin_read on public.equipment_requests
  for select
  using (((select public.is_platform_admin()) AND (org_id = (select public.ghost_active_org()))));

drop policy "admins can manage" on public.locations;
create policy "admins can manage" on public.locations
  for all
  using ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE ((organization_members.user_id = (select auth.uid())) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

drop policy "dept heads can add locations" on public.locations;
create policy "dept heads can add locations" on public.locations
  for insert to authenticated
  with check ((org_id IN ( SELECT om.org_id
   FROM organization_members om
  WHERE ((om.user_id = (select auth.uid())) AND (om.role = 'department_head'::text)))));

drop policy "dept heads can edit locations" on public.locations;
create policy "dept heads can edit locations" on public.locations
  for update to authenticated
  using ((org_id IN ( SELECT om.org_id
   FROM organization_members om
  WHERE ((om.user_id = (select auth.uid())) AND (om.role = 'department_head'::text)))))
  with check ((org_id IN ( SELECT om.org_id
   FROM organization_members om
  WHERE ((om.user_id = (select auth.uid())) AND (om.role = 'department_head'::text)))));

drop policy "members can view" on public.locations;
create policy "members can view" on public.locations
  for select
  using ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));

drop policy platform_admin_read on public.locations;
create policy platform_admin_read on public.locations
  for select
  using (((select public.is_platform_admin()) AND (org_id = (select public.ghost_active_org()))));

drop policy "admins can manage invites" on public.org_invites;
create policy "admins can manage invites" on public.org_invites
  for all
  using ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE ((organization_members.user_id = (select auth.uid())) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

drop policy platform_admin_read on public.org_invites;
create policy platform_admin_read on public.org_invites
  for select
  using (((select public.is_platform_admin()) AND (org_id = (select public.ghost_active_org()))));

drop policy members_select_self on public.organization_members;
create policy members_select_self on public.organization_members
  for select to authenticated
  using ((user_id = (select auth.uid())));

drop policy members_update_admin on public.organization_members;
create policy members_update_admin on public.organization_members
  for update to authenticated
  using (((role <> 'owner'::text) AND (EXISTS ( SELECT 1
   FROM organization_members me
  WHERE ((me.org_id = organization_members.org_id) AND (me.user_id = (select auth.uid())) AND (me.role = ANY (ARRAY['owner'::text, 'admin'::text])))))))
  with check (((role <> 'owner'::text) AND (EXISTS ( SELECT 1
   FROM organization_members me
  WHERE ((me.org_id = organization_members.org_id) AND (me.user_id = (select auth.uid())) AND (me.role = ANY (ARRAY['owner'::text, 'admin'::text])))))));

drop policy "org admins can remove members of their org" on public.organization_members;
create policy "org admins can remove members of their org" on public.organization_members
  for delete
  using (((role <> 'owner'::text) AND (EXISTS ( SELECT 1
   FROM organization_members me
  WHERE ((me.org_id = organization_members.org_id) AND (me.user_id = (select auth.uid())) AND (me.status = 'active'::text) AND (me.role = ANY (ARRAY['owner'::text, 'admin'::text])))))));

drop policy platform_admin_read on public.organization_members;
create policy platform_admin_read on public.organization_members
  for select
  using (((select public.is_platform_admin()) AND (org_id = (select public.ghost_active_org()))));

drop policy org_select_member on public.organizations;
create policy org_select_member on public.organizations
  for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_members m
  WHERE ((m.org_id = organizations.id) AND (m.user_id = (select auth.uid()))))));

drop policy "owners can update their organization" on public.organizations;
create policy "owners can update their organization" on public.organizations
  for update
  using ((id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE ((organization_members.user_id = (select auth.uid())) AND (organization_members.role = 'owner'::text)))))
  with check ((id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE ((organization_members.user_id = (select auth.uid())) AND (organization_members.role = 'owner'::text)))));

drop policy platform_admin_read on public.organizations;
create policy platform_admin_read on public.organizations
  for select
  using (((select public.is_platform_admin()) AND (id = (select public.ghost_active_org()))));

drop policy "admins can manage productions" on public.productions;
create policy "admins can manage productions" on public.productions
  for all
  using ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE ((organization_members.user_id = (select auth.uid())) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

drop policy "org members can read productions" on public.productions;
create policy "org members can read productions" on public.productions
  for select
  using ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));

drop policy platform_admin_read on public.productions;
create policy platform_admin_read on public.productions
  for select
  using (((select public.is_platform_admin()) AND (org_id = (select public.ghost_active_org()))));

drop policy platform_admin_read on public.profiles;
create policy platform_admin_read on public.profiles
  for select
  using (((select public.is_platform_admin()) AND (id IN ( SELECT m.user_id
   FROM organization_members m
  WHERE (m.org_id = (select public.ghost_active_org()))))));

drop policy "users can insert own profile" on public.profiles;
create policy "users can insert own profile" on public.profiles
  for insert
  with check (((select auth.uid()) = id));

drop policy "users can read own profile" on public.profiles;
create policy "users can read own profile" on public.profiles
  for select
  using (((select auth.uid()) = id));

drop policy "users can update own profile" on public.profiles;
create policy "users can update own profile" on public.profiles
  for update
  using (((select auth.uid()) = id));

drop policy "members can view subscription" on public.subscriptions;
create policy "members can view subscription" on public.subscriptions
  for select
  using ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));

drop policy platform_admin_read on public.subscriptions;
create policy platform_admin_read on public.subscriptions
  for select
  using (((select public.is_platform_admin()) AND (org_id = (select public.ghost_active_org()))));

drop policy "admins can manage teams" on public.teams;
create policy "admins can manage teams" on public.teams
  for all
  using ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE ((organization_members.user_id = (select auth.uid())) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

drop policy "org members can read teams" on public.teams;
create policy "org members can read teams" on public.teams
  for select
  using ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));

drop policy platform_admin_read on public.teams;
create policy platform_admin_read on public.teams
  for select
  using (((select public.is_platform_admin()) AND (org_id = (select public.ghost_active_org()))));


-- ── 3. Missing indexes ───────────────────────────────────────────────────────
create index if not exists equipment_items_org_id_idx     on public.equipment_items (org_id);
create index if not exists equipment_audit_org_at_idx     on public.equipment_audit (org_id, at desc);
create index if not exists equipment_audit_equipment_idx  on public.equipment_audit (equipment_id, at desc);
create index if not exists beta_feedback_org_id_idx       on public.beta_feedback (org_id);
create index if not exists equipment_requests_requested_by_idx on public.equipment_requests (requested_by);
create index if not exists org_invites_invited_by_idx     on public.org_invites (invited_by);
create index if not exists org_invites_team_id_idx        on public.org_invites (team_id);
create index if not exists platform_admin_state_org_idx   on public.platform_admin_state (active_org_id);

-- ── 4. Drop unused extension from public ─────────────────────────────────────
drop extension if exists pg_trgm;
