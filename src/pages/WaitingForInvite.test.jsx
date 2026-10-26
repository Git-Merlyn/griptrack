import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const h = vi.hoisted(() => ({ rpc: vi.fn(), useUser: vi.fn() }));
vi.mock("@/lib/supabaseClient", () => ({ supabase: { rpc: h.rpc } }));
vi.mock("@/context/useUser", () => ({ default: h.useUser }));
vi.mock("@/components/dialogs/AccountDialogs", () => ({
  DeleteAccountDialog: ({ isOpen }) => (isOpen ? <div>delete-dialog</div> : null),
}));

import WaitingForInvite, { RECHECK_MS } from "./WaitingForInvite";

const rebootstrap = vi.fn();
const logout = vi.fn();

function renderPage(overrides = {}) {
  h.useUser.mockReturnValue({
    authUser: { id: "u1", email: "pat@example.test" },
    profile: { email: "pat@example.test" },
    awaitingInvite: true,
    rebootstrap,
    logout,
    ...overrides,
  });
  render(
    <MemoryRouter initialEntries={["/waiting"]}>
      <Routes>
        <Route path="/waiting" element={<WaitingForInvite />} />
        <Route path="/" element={<div>home</div>} />
        <Route path="/org-setup" element={<div>org-setup</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.rpc.mockReset();
  rebootstrap.mockReset().mockResolvedValue(undefined);
  logout.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("WaitingForInvite (WP25)", () => {
  it("shows the email the admin should invite", () => {
    renderPage();
    expect(screen.getByTestId("waiting-email")).toHaveTextContent("pat@example.test");
  });

  it("redirects home when the user is no longer waiting", () => {
    renderPage({ awaitingInvite: false });
    expect(screen.getByText("home")).toBeInTheDocument();
  });

  it("Check again with no invite says so and stays", async () => {
    h.rpc.mockResolvedValue({ data: { org_id: null }, error: null });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByRole("status")).toHaveTextContent("No invite yet");
    expect(h.rpc).toHaveBeenCalledWith("bootstrap_session");
    expect(rebootstrap).not.toHaveBeenCalled();
  });

  it("Check again with an accepted invite re-bootstraps and goes home", async () => {
    h.rpc.mockResolvedValue({ data: { org_id: "org-1" }, error: null });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByText("home")).toBeInTheDocument();
    expect(rebootstrap).toHaveBeenCalledTimes(1);
  });

  it("re-checks quietly on a timer", async () => {
    vi.useFakeTimers();
    h.rpc.mockResolvedValue({ data: { org_id: null }, error: null });
    renderPage();
    expect(h.rpc).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(RECHECK_MS);
    });
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("I run a team instead: confirms, starts an org, then goes to org setup", async () => {
    h.rpc.mockResolvedValue({ data: [{ org_id: "org-9", role: "owner" }], error: null });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "I run a team instead" }));
    fireEvent.click(await screen.findByRole("button", { name: "Set up my company" }));
    expect(await screen.findByText("org-setup")).toBeInTheDocument();
    expect(h.rpc).toHaveBeenCalledWith("start_own_org");
    expect(rebootstrap).toHaveBeenCalledTimes(1);
  });

  it("I run a team instead: cancelling does nothing", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "I run a team instead" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("offers sign out and delete account", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(logout).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    expect(screen.getByText("delete-dialog")).toBeInTheDocument();
  });
});
