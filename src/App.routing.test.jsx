// App-level routing: L3 (bootstrap error screen), L7 (GhostBar gate),
// L22 (onboarding exemptions), L27 (deep links), L29 (404 inside layout).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Outlet, useLocation } from "react-router-dom";

const mock = vi.hoisted(() => ({ user: {} }));

vi.mock("./context/useUser", () => ({ default: () => mock.user }));
vi.mock("@vercel/analytics/react", () => ({ Analytics: () => null }));
vi.mock("@vercel/speed-insights/react", () => ({ SpeedInsights: () => null }));
vi.mock("./components/GhostBar", () => ({ default: () => <div>ghost-bar</div> }));
vi.mock("./components/layout/MainLayout", () => ({
  default: () => (
    <div data-testid="layout">
      <Outlet />
    </div>
  ),
}));
vi.mock("./pages/Auth", () => ({ default: () => <div>auth-page</div> }));
vi.mock("./pages/ResetPassword", () => ({ default: () => <div>reset-page</div> }));
vi.mock("./pages/Dashboard", () => ({ default: () => <div>dashboard-page</div> }));
vi.mock("./pages/LandingPage", () => ({ default: () => <div>landing-page</div> }));
vi.mock("./pages/Staff", () => ({ default: () => <div>staff-page</div> }));
vi.mock("./pages/CompleteProfile", () => ({ default: () => <div>complete-profile-page</div> }));
vi.mock("./pages/OrgSetup", () => ({ default: () => <div>org-setup-page</div> }));
vi.mock("./pages/InviteAccept", () => ({ default: () => <div>invite-accept-page</div> }));
vi.mock("./pages/WaitingForInvite", () => ({ default: () => <div>waiting-page</div> }));
vi.mock("./pages/PricingPage", () => ({ default: () => <div>pricing-page</div> }));

import App from "./App";

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="where" data-from={location.state?.from ?? ""}>
      {location.pathname}
    </div>
  );
}

const baseUser = {
  authUser: null,
  loadingOrg: false,
  needsOrgSetup: false,
  needsProfileSetup: false,
  features: { teams_enabled: false, requests_enabled: false },
  bootstrapError: null,
  rebootstrap: vi.fn(),
  logout: vi.fn(),
  isPlatformAdmin: false,
};
const signedIn = { ...baseUser, authUser: { id: "u1", email: "u1@example.test" } };

const tree = () => (
  <>
    <App />
    <LocationProbe />
  </>
);
const renderAt = (entry) =>
  render(<MemoryRouter initialEntries={[entry]}>{tree()}</MemoryRouter>);

beforeEach(() => {
  mock.user = { ...baseUser };
});

describe("L27 deep links", () => {
  it("remembers the protected path when bouncing a logged-out user to /auth", async () => {
    renderAt("/staff?tab=invites");
    expect(await screen.findByText("auth-page")).toBeInTheDocument();
    const where = screen.getByTestId("where");
    expect(where).toHaveTextContent("/auth");
    expect(where.dataset.from).toBe("/staff?tab=invites");
  });

  it("returns to the remembered path after sign-in", async () => {
    const view = renderAt("/staff");
    await screen.findByText("auth-page");
    mock.user = { ...signedIn };
    view.rerender(<MemoryRouter initialEntries={["/staff"]}>{tree()}</MemoryRouter>);
    // MemoryRouter keeps its own history across rerenders, so the router is
    // still at /auth with state.from = "/staff".
    expect(await screen.findByText("staff-page")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/staff");
  });

  it("ignores an unsafe from and goes home", async () => {
    mock.user = { ...signedIn };
    renderAt({ pathname: "/auth", state: { from: "//evil.example/steal" } });
    expect(await screen.findByText("dashboard-page")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/);
  });
});

describe("L22 onboarding exemptions", () => {
  it("lets a recovery session reach /reset-password even when the profile is incomplete", async () => {
    mock.user = { ...signedIn, needsProfileSetup: true };
    renderAt("/reset-password");
    expect(await screen.findByText("reset-page")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/reset-password");
  });

  it("lets a recovery session reach /reset-password even when the org needs setup", async () => {
    mock.user = { ...signedIn, needsOrgSetup: true };
    renderAt("/reset-password");
    expect(await screen.findByText("reset-page")).toBeInTheDocument();
  });

  it("still sends other pages to /complete-profile", async () => {
    mock.user = { ...signedIn, needsProfileSetup: true };
    renderAt("/staff");
    expect(await screen.findByText("complete-profile-page")).toBeInTheDocument();
  });
});

describe("L29 not found", () => {
  it("renders the 404 inside the app layout with a link home", async () => {
    mock.user = { ...signedIn };
    renderAt("/no-such-page");
    const heading = await screen.findByRole("heading", { name: "Page not found" });
    expect(screen.getByTestId("layout")).toContainElement(heading);
    expect(screen.getByRole("link", { name: "Back to inventory" })).toHaveAttribute("href", "/");
  });
});

describe("L3 bootstrap failure", () => {
  it("shows a retry screen instead of the app, and Try again calls rebootstrap", async () => {
    const rebootstrap = vi.fn().mockResolvedValue(undefined);
    mock.user = { ...signedIn, bootstrapError: new Error("network down"), rebootstrap };
    renderAt("/");
    expect(screen.getByRole("alert")).toHaveTextContent("network down");
    expect(screen.queryByText("dashboard-page")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(rebootstrap).toHaveBeenCalledTimes(1);
  });
});

describe("L7 GhostBar gate", () => {
  it("does not mount GhostBar for ordinary users", async () => {
    mock.user = { ...signedIn };
    renderAt("/");
    await screen.findByText("dashboard-page");
    expect(screen.queryByText("ghost-bar")).not.toBeInTheDocument();
  });

  it("mounts GhostBar for platform admins", async () => {
    mock.user = { ...signedIn, isPlatformAdmin: true };
    renderAt("/");
    expect(await screen.findByText("ghost-bar")).toBeInTheDocument();
  });
});

describe("WP25 waiting for an invite", () => {
  const waiting = () => ({ ...signedIn, awaitingInvite: true, needsProfileSetup: false });

  it("sends a crew sign-up with no org to /waiting from any app page", async () => {
    mock.user = waiting();
    renderAt("/staff");
    expect(await screen.findByText("waiting-page")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/waiting");
  });

  it("never sends them to org setup, even if needsOrgSetup were set", async () => {
    mock.user = { ...waiting(), needsOrgSetup: true };
    renderAt("/");
    expect(await screen.findByText("waiting-page")).toBeInTheDocument();
  });

  it("still lets them open the public pages", async () => {
    mock.user = waiting();
    renderAt("/pricing");
    expect(await screen.findByText("pricing-page")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/pricing");
  });
});
