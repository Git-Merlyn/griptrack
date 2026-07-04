/**
 * Role definitions and permission rules — the single source of truth for
 * both apps (web imports via the "@shared" alias, mobile via metro's extra
 * watch folder). Keep this file dependency-free.
 *
 * Server-side enforcement lives in the RLS policies
 * (supabase/migrations/*_rls_hardening.sql); these helpers must stay in
 * sync with them — they gate UI, the database gates reality.
 */

export type Role = 'owner' | 'admin' | 'department_head' | 'crew';

/** Roles that can manage inventory (add/edit items, approve requests). */
export function canManageInventory(role: Role): boolean {
  return role === 'owner' || role === 'admin' || role === 'department_head';
}

/** Roles that can see all teams and switch between them. */
export function canSwitchTeams(role: Role): boolean {
  return role === 'owner' || role === 'admin';
}

/** Roles that can delete items or manage users across all teams. */
export function isOrgAdmin(role: Role): boolean {
  return role === 'owner' || role === 'admin';
}

/** Roles assignable to other members — 'owner' is never grantable. */
export const ASSIGNABLE_ROLES: Role[] = ['crew', 'department_head', 'admin'];
