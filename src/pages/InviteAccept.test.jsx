// InviteAccept with no pending invite (audit L28).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const mock = vi.hoisted(() => ({ user: {} }));
vi.mock("@/context/useUser", () => ({ default: () => mock.user }));
vi.mock("@/lib/supabaseClient", () => ({ supabase: { auth: {}, from: () => ({}) } }));

import InviteAccept from "./InviteAccept";

const base = {
  authUser: { id: "u1", email: "new.hire@example.test" },
  loadingOrg: false,
  needsOrgSetup: true,
  needsProfileSetup: true,
  profile: { full_name: "" },
  applyProfile: vi.fn(),
  orgId: null,
  inviteAccepted: false,
  logout: vi.fn(),
};

const renderAt = (url) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/invite-accept" element={<InviteAccept />} />
        <Route path="/" element={<div>home</div>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  mock.user = { ...base, logout: vi.fn() };
});

describe("InviteAccept (L28)", () => {
  it("explains that no invite was found instead of starting org setup", () => {
    renderAt("/invite-accept?email=new.hire%40example.test");
    expect(screen.getByRole("heading", { name: "No pending invite found" })).toBeInTheDocument();
    expect(screen.getByText(/new\.hire@example\.test/)).toBeInTheDocument();
    expect(screen.queryByText("Finish joining your team")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(mock.user.logout).toHaveBeenCalledTimes(1);
  });

  it("shows the finish-joining form when an invite was accepted", () => {
    mock.user = { ...base, orgId: "org-1", needsOrgSetup: false, inviteAccepted: true };
    renderAt("/invite-accept");
    expect(screen.getByText("Finish joining your team")).toBeInTheDocument();
  });

  it("goes home when the user already has a real org (e.g. reload after accepting)", async () => {
    mock.user = { ...base, orgId: "org-1", needsOrgSetup: false, needsProfileSetup: false };
    renderAt("/invite-accept");
    expect(await screen.findByText("home")).toBeInTheDocument();
  });
});
