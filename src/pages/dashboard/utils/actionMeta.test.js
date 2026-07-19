import { describe, it, expect } from "vitest";
import { getActionMeta, ACTION_META } from "./actionMeta";

describe("actionMeta", () => {
  it("has a label + className for every action written by either platform", () => {
    for (const action of ["create", "update", "edit", "move", "merge", "damage", "delete"]) {
      expect(ACTION_META[action]).toBeDefined();
      expect(ACTION_META[action].label).toBeTruthy();
      expect(ACTION_META[action].className).toBeTruthy();
    }
  });

  it("maps mobile's 'edit' to the same label as web's 'update'", () => {
    expect(getActionMeta("edit").label).toBe(getActionMeta("update").label);
  });

  it("falls back to the raw action string for unknown values", () => {
    expect(getActionMeta("something_new").label).toBe("something_new");
  });

  it("falls back to 'Unknown' for a missing/empty action", () => {
    expect(getActionMeta(null).label).toBe("Unknown");
    expect(getActionMeta(undefined).label).toBe("Unknown");
  });
});
