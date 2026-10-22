import { describe, it, expect } from "vitest";
import { safeRedirectPath } from "./authRedirect";

describe("safeRedirectPath (L27)", () => {
  it("keeps an app-relative path with its query", () => {
    expect(safeRedirectPath("/staff")).toBe("/staff");
    expect(safeRedirectPath("/requests?status=pending")).toBe("/requests?status=pending");
  });

  it("falls back to / for anything that is not an app-relative path", () => {
    for (const bad of [undefined, null, 42, "", "staff", "https://evil.example/x",
      "//evil.example/x", "/\\evil.example", "/staff\nfoo"]) {
      expect(safeRedirectPath(bad)).toBe("/");
    }
  });

  it("never returns to an auth page (would loop)", () => {
    for (const p of ["/auth", "/auth?mode=signup", "/invite", "/invite-accept", "/reset-password#x"]) {
      expect(safeRedirectPath(p)).toBe("/");
    }
  });
});
