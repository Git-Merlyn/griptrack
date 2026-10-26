import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

vi.mock("@/context/useUser", () => ({
  default: () => ({
    role: "owner",
    isCoordinator: true,
    features: {},
    profile: { full_name: "Owner", email: "owner@example.test" },
    logout: vi.fn(),
  }),
}));
vi.mock("@/hooks/useTrial", () => ({
  default: () => ({ isTrialActive: false, daysLeft: 0 }),
}));
vi.mock("@/context/useTeam", () => ({
  default: () => ({ activeTeam: null, activeTeamId: null, canSwitchTeams: false }),
}));
vi.mock("@/hooks/useTheme", () => ({
  default: () => ({ isDark: true, mode: "system", setMode: vi.fn(), toggleTheme: vi.fn() }),
}));
vi.mock("@/lib/supabaseClient", () => ({ supabase: { functions: { invoke: vi.fn() }, auth: {} } }));
vi.mock("./feedback/FeedbackModal", () => ({ default: () => null }));

import Sidebar from "./Sidebar";

// Real browsers deliver mousedown and click as separate events, and React
// re-renders in between. userEvent.click() fires both before that re-render,
// which hides the bug, so press, let React settle, then release.
async function pressAndRelease(el) {
  fireEvent.mouseDown(el);
  await act(async () => {});
  fireEvent.mouseUp(el);
  fireEvent.click(el);
}

function CurrentPath() {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

function renderSidebar() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Sidebar />
      <Routes>
        <Route path="*" element={<CurrentPath />} />
      </Routes>
    </MemoryRouter>,
  );
}

let originalMatchMedia;

function setViewport({ mobile }) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: mobile,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

beforeEach(() => {
  originalMatchMedia = window.matchMedia;
});
afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe("Sidebar settings menu", () => {
  it("menu items work from the mobile drawer (narrow window)", async () => {
    setViewport({ mobile: true });
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    // Settings buttons exist in both the hidden desktop sidebar and the drawer.
    // The drawer renders first in the DOM, so index 0 is the drawer's copy.
    const settingsButtons = screen.getAllByRole("button", { name: /^Settings$/ });
    await user.click(settingsButtons[0]);

    const appSettings = screen.getAllByRole("button", { name: /App settings/ });
    await pressAndRelease(appSettings[0]);

    expect(screen.getByTestId("path")).toHaveTextContent("/settings");
  });

  it("Change password opens its form from the mobile drawer", async () => {
    setViewport({ mobile: true });
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    const settingsButtons = screen.getAllByRole("button", { name: /^Settings$/ });
    await user.click(settingsButtons[0]);
    const changePw = screen.getAllByRole("button", { name: /Change password/ });
    await pressAndRelease(changePw[0]);

    expect(screen.getAllByText("Change password").length).toBeGreaterThan(0);
    expect(screen.getAllByPlaceholderText(/password/i).length).toBeGreaterThan(0);
  });

  it("menu items still work from the desktop sidebar", async () => {
    setViewport({ mobile: false });
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole("button", { name: /^Settings$/ }));
    await pressAndRelease(screen.getByRole("button", { name: /Billing & plan/ }));

    expect(screen.getByTestId("path")).toHaveTextContent("/billing");
  });

  it("a click outside still closes the panel", async () => {
    setViewport({ mobile: false });
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole("button", { name: /^Settings$/ }));
    expect(screen.getByRole("button", { name: /Billing & plan/ })).toBeInTheDocument();
    await pressAndRelease(screen.getByTestId("path"));
    expect(screen.queryByRole("button", { name: /Billing & plan/ })).not.toBeInTheDocument();
  });
});
