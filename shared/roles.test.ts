// Pins each helper to the role matrix observed against the live RLS policies
// (Momus MO.9, 2026-11-02). If a policy changes, change the helper and this
// table in the same commit.
import { describe, expect, it } from "vitest";
import {
  ASSIGNABLE_ROLES, canDeleteLocations, canDeletePdfTemplates, canEditLocations, canManageInventory, canManageProductions,
  canManageTeams, canReviewRequests, canSwitchTeams, canUpdateItems, isOrgAdmin, type Role,
} from "./roles";

const ROLES: Role[] = ["owner", "admin", "department_head", "crew"];
// owner, admin, department_head, crew
const MATRIX: Record<string, [boolean, boolean, boolean, boolean]> = {
  canManageInventory: [true, true, true, false],   // equipment_items INSERT (dept head: own team)
  canUpdateItems: [true, true, true, true],        // equipment_items UPDATE (dept head, crew: own team)
  isOrgAdmin: [true, true, false, false],          // equipment_items DELETE, organization_members UPDATE/DELETE
  canSwitchTeams: [true, true, false, false],
  canReviewRequests: [true, true, false, false],   // equipment_requests UPDATE
  canManageTeams: [true, true, false, false],      // teams INSERT/UPDATE/DELETE
  canEditLocations: [true, true, true, false],     // locations INSERT/UPDATE
  canDeleteLocations: [true, true, false, false],  // locations DELETE
  canManageProductions: [true, true, false, false],// productions INSERT/UPDATE/DELETE
  canDeletePdfTemplates: [true, true, true, false],// pdf_templates DELETE
};
const FN: Record<string, (r: Role) => boolean> = {
  canManageInventory, canUpdateItems, isOrgAdmin, canSwitchTeams, canReviewRequests, canManageTeams,
  canEditLocations, canDeleteLocations, canManageProductions, canDeletePdfTemplates,
};

describe("shared/roles matches the observed RLS matrix", () => {
  for (const [name, row] of Object.entries(MATRIX)) {
    it(name, () => {
      expect(ROLES.map((r) => FN[name](r))).toEqual(row);
    });
  }
  it("owner is never assignable", () => {
    expect(ASSIGNABLE_ROLES).not.toContain("owner");
    expect(ASSIGNABLE_ROLES).toEqual(["crew", "department_head", "admin"]);
  });
});
