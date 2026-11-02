/**
 * Role definitions and permission rules — the single source of truth for
 * both apps (web imports via the "@shared" alias, mobile via metro's extra
 * watch folder). Keep this file dependency-free.
 *
 * These helpers gate UI; the database gates reality. Each one must match the
 * RLS policy named next to it. The current policies are spread over several
 * migrations (remote_schema, rls_hardening, teams_off_mode, advisor_lints,
 * definer_grants_policy_lints). To see what is live, run:
 *   select tablename, policyname, cmd from pg_policies where schemaname = 'public';
 * If you change a policy, change the helper here in the same commit.
 */

export type Role = 'owner' | 'admin' | 'department_head' | 'crew';

/**
 * Add items.
 * RLS: equipment_items "equipment insert by role" (dept heads: own team only
 * when teams are on) and "equipment insert (teams off)".
 * Editing an existing item is the wider rule in canUpdateItems — crew can do
 * that within their team. Does NOT cover reviewing requests (see
 * canReviewRequests).
 */
export function canManageInventory(role: Role): boolean {
  return role === 'owner' || role === 'admin' || role === 'department_head';
}

/**
 * Edit an existing item: move gear, and change its details (name, quantity,
 * reserve minimum, status, dates, location). Every role; owners and admins
 * org-wide, department heads and crew within their own team.
 * RLS: equipment_items "equipment update by role" and "equipment update
 * (teams off)". The policy's WITH CHECK inherits its scope, so an item cannot
 * be moved to another team or organisation this way.
 * Verified against the live policies by Momus (2026-11-02, MO.9).
 */
export function canUpdateItems(_role: Role): boolean {
  return true;
}

/** See all teams and switch between them. */
export function canSwitchTeams(role: Role): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Org-wide admin: delete items, manage members and invites.
 * RLS: equipment_items "equipment delete by role"; organization_members
 * UPDATE (role, team_id — column grants) and DELETE policies.
 * Invites: clients hold only SELECT on org_invites plus UPDATE on status
 * (accept/decline). Creating and revoking invites goes through the
 * invite-staff edge function, which verifies the caller is an owner/admin
 * of the org before it writes with the service role (hardening of
 * 2026-10-21, audit H2). There is no longer an RLS write policy for admins.
 */
export function isOrgAdmin(role: Role): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Approve or deny equipment requests. Owner/admin only — department heads
 * cannot (the README used to say otherwise; the policy and this helper are
 * the rule).
 * RLS: equipment_requests "admins can review requests" (owner/admin only).
 */
export function canReviewRequests(role: Role): boolean {
  return isOrgAdmin(role);
}

/**
 * Create, archive and delete teams.
 * RLS: teams "admins can manage teams" (owner/admin only).
 */
export function canManageTeams(role: Role): boolean {
  return isOrgAdmin(role);
}

/**
 * Add, rename and activate/deactivate locations.
 * RLS: locations "admins can manage" + "dept heads can add locations" /
 * "dept heads can edit locations".
 */
export function canEditLocations(role: Role): boolean {
  return canManageInventory(role);
}

/**
 * Delete locations.
 * RLS: locations "admins can manage" only; there is no dept-head DELETE policy.
 */
export function canDeleteLocations(role: Role): boolean {
  return isOrgAdmin(role);
}

/**
 * Create, edit and delete productions. Owner/admin only.
 * RLS: productions "admins can manage productions". (Observed matrix,
 * Momus MO.9: SELECT all roles; INSERT/UPDATE/DELETE owner and admin.)
 */
export function canManageProductions(role: Role): boolean {
  return isOrgAdmin(role);
}

/**
 * Delete a saved PDF template. Owner, admin and department head.
 * RLS: pdf_templates DELETE via can_manage_pdf_templates(); every member
 * can SELECT; templates are created and updated only through the RPCs
 * (record_pdf_template_use, the build-pdf-template function), never by a
 * direct INSERT or UPDATE. (Observed matrix, Momus MO.9.)
 */
export function canDeletePdfTemplates(role: Role): boolean {
  return canManageInventory(role);
}

/**
 * What the helpers above do not gate, as the live policies behave
 * (observed by Momus, 2026-11-02):
 * - subscriptions: every member can SELECT their org's row; no client writes
 *   (the Stripe webhook writes with the service role).
 * - equipment_audit: every member can SELECT their org's history; rows are
 *   written only by the trigger.
 * - beta_feedback: every signed-in user can INSERT (org_id is set by the
 *   trigger); no SELECT/UPDATE/DELETE for clients.
 * - equipment_requests: every member can file (INSERT) and read; review is
 *   canReviewRequests; no client DELETE for dept heads or crew.
 * - organization_members: no client INSERT (joins happen through invites).
 * - invite_sends, pdf_template_builds, platform_admin_audit: no client access.
 */

/** Roles assignable to other members — 'owner' is never grantable. */
export const ASSIGNABLE_ROLES: Role[] = ['crew', 'department_head', 'admin'];
