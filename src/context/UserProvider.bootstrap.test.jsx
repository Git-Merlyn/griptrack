// UserProvider bootstrap: L3 (error + retry), L7 (is_platform_admin),
// L28 (p_from_invite on /invite-accept, with a fallback for old DBs).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { useContext } from "react";

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  session: { user: { id: "u1", email: "u1@example.test" } },
}));

vi.mock("@sentry/react", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    rpc: h.rpc,
    auth: {
      getSession: async () => ({ data: { session: h.session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => ({}),
    },
  },
}));

import * as Sentry from "@sentry/react";
import UserProvider from "./UserProvider";
import UserContext from "./UserContext";

const BOOT = {
  org_id: "org-1",
  role: "owner",
  ghost: false,
  ghost_write: false,
  is_platform_admin: false,
  invite_accepted: false,
  org: { name: "Polaris Grip", trial_ends_at: null, features: { teams_enabled: false, requests_enabled: false } },
  subscription: null,
  team_id: null,
  profile: { id: "u1", email: "u1@example.test", full_name: "U One", phone: null },
};

let ctx;
function Probe() {
  ctx = useContext(UserContext);
  return (
    <div data-testid="state">
      {ctx.loadingOrg ? "loading" : `org=${ctx.orgId ?? "none"} err=${ctx.bootstrapError ? "yes" : "no"} admin=${ctx.isPlatformAdmin} invite=${ctx.inviteAccepted}`}
    </div>
  );
}
const renderProvider = () =>
  render(
    <UserProvider>
      <Probe />
    </UserProvider>,
  );

beforeEach(() => {
  h.rpc.mockReset();
  vi.mocked(Sentry.captureException).mockClear();
  window.history.pushState({}, "", "/");
});
afterEach(() => {
  window.history.pushState({}, "", "/");
});

describe("UserProvider bootstrap", () => {
  it("L3: records a failed bootstrap, reports it, and recovers on rebootstrap()", async () => {
    h.rpc.mockResolvedValueOnce({ data: null, error: { message: "network down" } });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("org=none err=yes"));
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);

    h.rpc.mockResolvedValueOnce({ data: BOOT, error: null });
    await act(async () => {
      await ctx.rebootstrap();
    });
    expect(screen.getByTestId("state")).toHaveTextContent("org=org-1 err=no");
    expect(h.rpc).toHaveBeenLastCalledWith("bootstrap_session");
  });

  it("L7: exposes is_platform_admin from bootstrap_session", async () => {
    h.rpc.mockResolvedValueOnce({ data: { ...BOOT, is_platform_admin: true }, error: null });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("admin=true"));
    expect(h.rpc).toHaveBeenCalledWith("bootstrap_session");
  });

  it("L28: on /invite-accept asks the server not to create an org", async () => {
    window.history.pushState({}, "", "/invite-accept?email=u1%40example.test");
    h.rpc.mockResolvedValueOnce({ data: { ...BOOT, org_id: null, org: null }, error: null });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("org=none err=no"));
    expect(h.rpc).toHaveBeenCalledWith("bootstrap_session", { p_from_invite: true });
  });

  it("L28: falls back to the plain call while the new overload is not deployed", async () => {
    window.history.pushState({}, "", "/invite-accept");
    h.rpc
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "not found" } })
      .mockResolvedValueOnce({ data: { ...BOOT, invite_accepted: true }, error: null });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("org=org-1 err=no admin=false invite=true"));
    expect(h.rpc.mock.calls).toEqual([
      ["bootstrap_session", { p_from_invite: true }],
      ["bootstrap_session"],
    ]);
  });
});
