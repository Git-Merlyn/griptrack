import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ────────────────────────────────────────────────────────────────────
// vi.hoisted so the mock factories below can reference these.
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/lib/supabaseClient", () => {
  // Every PostgREST chain used by Staff (select/eq/in/order) resolves to an
  // empty result. The builder is thenable so `await supabase.from(..)...` works
  // whichever method ends the chain.
  const result = { data: [], error: null };
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    update: () => builder,
    delete: () => builder,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return {
    supabase: {
      from: () => builder,
      functions: { invoke },
    },
  };
});

vi.mock("@/context/useUser", () => ({
  default: () => ({ orgId: "org-1", role: "admin", isCoordinator: true, ghostReadOnly: false, authUser: { id: "user-1" }, effectivePlan: "pro", loadingSubscription: false }),
}));

vi.mock("@/context/useTeam", () => ({
  default: () => ({ teams: [], loadingTeams: false, activeTeamId: null }),
}));

import Staff from "./Staff";

async function submitInvite(address) {
  const user = userEvent.setup();
  render(<Staff />);
  await user.type(screen.getByPlaceholderText("Email address"), address);
  await user.click(screen.getByRole("button", { name: "Send Invite" }));
}

describe("Staff invite (C1: no sign-in links)", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("sends the invite and shows the generic confirmation", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });

    await submitInvite("new@example.test");

    expect(invoke).toHaveBeenCalledWith("invite-staff", {
      body: { email: "new@example.test", orgId: "org-1", role: "crew", teamId: null },
    });
    expect(await screen.findByText(/Invite sent to new@example\.test\./)).toBeInTheDocument();
  });

  it("never renders a sign-in link, even if an old server still returns one", async () => {
    const leaked = "https://example.supabase.co/auth/v1/verify?token=SECRET&type=magiclink";
    invoke.mockResolvedValue({
      data: { ok: true, alreadyRegistered: true, generatedLink: leaked },
      error: null,
    });

    await submitInvite("existing@example.test");

    expect(await screen.findByText(/Invite sent to existing@example\.test\./)).toBeInTheDocument();
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(document.body.innerHTML).not.toContain("SECRET");
    expect(document.body.innerHTML).not.toContain("magiclink");
    expect(screen.queryByText(/sign-in link/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
