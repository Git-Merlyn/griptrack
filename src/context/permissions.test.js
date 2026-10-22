import { describe, it, expect } from "vitest";
import { inventoryPermissions } from "./permissions";

const NONE = { canAdd: false, canEdit: false, canDelete: false, canMove: false };

describe("inventoryPermissions (mirrors equipment_items RLS)", () => {
  it.each([
    ["owner",           { canAdd: true,  canEdit: true,  canDelete: true,  canMove: true }],
    ["admin",           { canAdd: true,  canEdit: true,  canDelete: true,  canMove: true }],
    ["department_head", { canAdd: true,  canEdit: true,  canDelete: false, canMove: true }],
    ["crew",            { canAdd: false, canEdit: false, canDelete: false, canMove: true }],
  ])("%s", (role, expected) => {
    expect(inventoryPermissions(role)).toEqual(expected);
    expect(inventoryPermissions(role, { ghostReadOnly: false })).toEqual(expected);
  });

  it("grants nothing without a role", () => {
    expect(inventoryPermissions(null)).toEqual(NONE);
    expect(inventoryPermissions(undefined)).toEqual(NONE);
  });

  it("grants nothing to a read-only ghost, even though it is reported as owner (L1)", () => {
    expect(inventoryPermissions("owner", { ghostReadOnly: true })).toEqual(NONE);
  });
});
