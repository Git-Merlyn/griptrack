import { describe, it, expect, vi } from "vitest";
import { revokeInvite, resendInviteBody } from "./orgInvites";

function mockClient(result) {
  const q = {};
  const calls = [];
  ["from", "update", "eq", "select"].forEach((m) => {
    q[m] = vi.fn((...args) => {
      calls.push([m, ...args]);
      return m === "select" ? Promise.resolve(result) : q;
    });
  });
  return { client: q, calls };
}

describe("revokeInvite", () => {
  it("sets status revoked on the pending invite and selects the id", async () => {
    const { client, calls } = mockClient({ data: [{ id: "inv-1" }], error: null });
    await revokeInvite(client, "inv-1");
    expect(calls).toEqual([
      ["from", "org_invites"],
      ["update", { status: "revoked" }],
      ["eq", "id", "inv-1"],
      ["eq", "status", "pending"],
      ["select", "id"],
    ]);
  });

  it("throws when RLS filtered the update to zero rows", async () => {
    const { client } = mockClient({ data: [], error: null });
    await expect(revokeInvite(client, "inv-1")).rejects.toThrow(
      "This invite was already accepted or revoked.",
    );
  });

  it("throws the PostgREST error message", async () => {
    const { client } = mockClient({ data: null, error: { message: "permission denied for table org_invites" } });
    await expect(revokeInvite(client, "inv-1")).rejects.toThrow("permission denied for table org_invites");
  });
});

describe("resendInviteBody", () => {
  it("re-uses the invite's email, role and team", () => {
    expect(
      resendInviteBody({ email: "a@b.test", role: "admin", team_id: "t1" }, "org-1"),
    ).toEqual({ email: "a@b.test", orgId: "org-1", role: "admin", teamId: "t1" });
  });

  it("sends teamId null when the invite has no team", () => {
    expect(resendInviteBody({ email: "a@b.test", role: "crew", team_id: null }, "org-1").teamId).toBeNull();
  });
});
