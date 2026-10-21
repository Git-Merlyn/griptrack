import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import useUser from "@/context/useUser";
import TrialBanner from "./TrialBanner";

vi.mock("@/context/useUser");

const DAY = 24 * 60 * 60 * 1000;
// A minute short of N whole days, so Math.ceil() in useTrial yields exactly N.
const inDays = (n) => new Date(Date.now() + n * DAY - 60_000).toISOString();

const renderAs = (user) => {
  vi.mocked(useUser).mockReturnValue(user);
  return render(
    <MemoryRouter>
      <TrialBanner />
    </MemoryRouter>,
  );
};

describe("TrialBanner", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(useUser).mockReset();
  });

  it("shows the owner a charge warning when the Stripe trial has <= 7 days left", () => {
    renderAs({
      role: "owner",
      plan: "pro",
      trialEndsAt: null,
      subscription: { status: "trialing", plan: "pro", current_period_end: inDays(3) },
    });
    expect(screen.getByText(/Your Pro trial ends in 3 days\. Your card will be charged on/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage billing" })).toHaveAttribute("href", "/billing");
  });

  it("says the trial won't renew when the owner cancelled", () => {
    renderAs({
      role: "owner",
      plan: "team",
      trialEndsAt: null,
      subscription: {
        status: "trialing",
        plan: "team",
        current_period_end: inDays(1),
        cancel_at_period_end: true,
      },
    });
    expect(screen.getByText("Your Team trial ends in 1 day and won't renew.")).toBeInTheDocument();
  });

  it.each(["admin", "department_head", "crew"])("renders nothing for %s", (role) => {
    const { container } = renderAs({
      role,
      plan: "pro",
      trialEndsAt: null,
      subscription: { status: "trialing", plan: "pro", current_period_end: inDays(3) },
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("never shows a 'trial has ended' banner for a lapsed org trial_ends_at", () => {
    const { container } = renderAs({
      role: "owner",
      plan: "free",
      trialEndsAt: "2026-01-01T00:00:00Z",
      subscription: { status: "active", plan: "free" },
    });
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/trial has ended/i)).toBeNull();
  });

  it("shows nothing for a new Free org whose trial_ends_at is in the future", () => {
    const { container } = renderAs({
      role: "owner",
      plan: "free",
      trialEndsAt: inDays(3),
      subscription: { status: "active", plan: "free" },
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while more than 7 days remain", () => {
    const { container } = renderAs({
      role: "owner",
      plan: "pro",
      trialEndsAt: null,
      subscription: { status: "trialing", plan: "pro", current_period_end: inDays(10) },
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("can be dismissed for the session", async () => {
    const user = userEvent.setup();
    const { container } = renderAs({
      role: "owner",
      plan: "pro",
      trialEndsAt: null,
      subscription: { status: "trialing", plan: "pro", current_period_end: inDays(2) },
    });
    await user.click(screen.getByRole("button", { name: "Dismiss trial banner" }));
    expect(container).toBeEmptyDOMElement();
    expect(sessionStorage.getItem("gt_trial_banner_dismissed")).toBe("1");
  });
});
