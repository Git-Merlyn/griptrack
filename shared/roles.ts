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
 * Add items and edit item details.
 * RLS: equipment_items "equipment insert by role" (dept heads: own team only
 * when teams are on) and "equipment insert (teams off)".
 * Does NOT cover reviewing requests (see canReviewRequests).
 */
export function canManageInventory(role: Role): boolean {
  return role === 'owner' || role === 'admin' || role === 'department_head';
}

/** See all teams and switch between them. */
export function canSwitchTeams(role: Role): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Org-wide admin: delete items, manage members and invites.
 * RLS: equipment_items "equipment delete by role", org_invites "admins can
 * manage invites", organization_members update/delete policies.
 */
export function isOrgAdmin(role: Role): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Approve or deny equipment requests.
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

/** Roles assignable to other members — 'owner' is never grantable. */
export const ASSIGNABLE_ROLES: Role[] = ['crew', 'department_head', 'admin'];
