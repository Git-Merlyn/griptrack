import { canManageInventory, isOrgAdmin } from "@shared/roles";

/**
 * Inventory write controls for the web app, derived from shared/roles.ts so
 * they match the equipment_items RLS policies:
 *   add / edit metadata -> owner, admin, department_head (canManageInventory)
 *   delete              -> owner, admin (isOrgAdmin)
 *   move                -> every member
 * A read-only ghost session (platform admin viewing an org without armed
 * write) gets none of them: RLS refuses every ghost write until it is armed.
 *
 * @param {string|null|undefined} role  effective role ('owner'|'admin'|'department_head'|'crew')
 * @param {{ ghostReadOnly?: boolean }} [opts]
 */
export function inventoryPermissions(role, { ghostReadOnly = false } = {}) {
  const writable = !!role && !ghostReadOnly;
  return {
    canAdd:    writable && canManageInventory(role),
    canEdit:   writable && canManageInventory(role),
    canDelete: writable && isOrgAdmin(role),
    canMove:   writable,
  };
}
