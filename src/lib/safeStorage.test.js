import { describe, it, expect, afterEach, vi } from "vitest";
import { safeGetItem, safeSetItem, safeRemoveItem } from "./safeStorage";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("safeStorage (L6)", () => {
  it("reads, writes and removes normally when storage works", () => {
    expect(safeSetItem("k", "v")).toBe(true);
    expect(safeGetItem("k")).toBe("v");
    expect(safeRemoveItem("k")).toBe(true);
    expect(safeGetItem("k")).toBeNull();
  });

  it("never throws when touching window.localStorage throws (Safari 'Block all cookies')", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });
    expect(safeGetItem("k")).toBeNull();
    expect(safeSetItem("k", "v")).toBe(false);
    expect(safeRemoveItem("k")).toBe(false);
  });
});
