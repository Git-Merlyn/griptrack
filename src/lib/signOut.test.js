import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSignOut = vi.fn();
vi.mock("@/lib/supabaseClient", () => ({
  supabase: { auth: { signOut: (...a) => mockSignOut(...a), storageKey: "sb-test-auth-token" } },
}));

import { signOutWithLocalFallback } from "./signOut";

const KEYS = ["sb-test-auth-token", "sb-test-auth-token-user", "sb-test-auth-token-code-verifier"];

describe("signOutWithLocalFallback (L31)", () => {
  beforeEach(() => {
    mockSignOut.mockReset();
    window.localStorage.clear();
    for (const k of KEYS) window.localStorage.setItem(k, "x");
    window.localStorage.setItem("unrelated", "keep");
  });

  it("server sign-out ok: leaves localStorage to supabase-js", async () => {
    mockSignOut.mockResolvedValue({ error: null });
    await expect(signOutWithLocalFallback()).resolves.toEqual({ localOnly: false });
    expect(window.localStorage.getItem("sb-test-auth-token")).toBe("x");
  });

  it("server sign-out returns an error: removes the stored session keys", async () => {
    mockSignOut.mockResolvedValue({ error: { name: "AuthRetryableFetchError", message: "Failed to fetch" } });
    await expect(signOutWithLocalFallback()).resolves.toEqual({ localOnly: true });
    for (const k of KEYS) expect(window.localStorage.getItem(k)).toBeNull();
    expect(window.localStorage.getItem("unrelated")).toBe("keep");
  });

  it("server sign-out throws: still removes the keys and does not throw", async () => {
    mockSignOut.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(signOutWithLocalFallback()).resolves.toEqual({ localOnly: true });
    expect(window.localStorage.getItem("sb-test-auth-token")).toBeNull();
  });
});
