import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import useUser from "@/context/useUser";
import useTrial from "./useTrial";

vi.mock("@/context/useUser");

describe("useTrial", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const setup = (userData) => {
    vi.mocked(useUser).mockReturnValue(userData);
    return renderHook(() => useTrial()).result.current;
  };

  it("returns noop when on a paid active plan", () => {
    const result = setup({ plan: "pro", subscription: { status: "active" }, trialEndsAt: "2026-12-01" });
    expect(result.isTrialActive).toBe(false);
    expect(result.daysLeft).toBeNull();
    expect(result.trialEndDate).toBeNull();
    expect(result.isStripeTrial).toBe(false);
  });

  it("returns Stripe trial state when subscription.status === 'trialing' with future end", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T00:00:00Z"));

    const result = setup({
      plan: "pro",
      subscription: { status: "trialing", current_period_end: "2026-05-15T00:00:00Z" },
      trialEndsAt: null,
    });

    expect(result.isTrialActive).toBe(true);
    expect(result.isStripeTrial).toBe(true);
    expect(result.daysLeft).toBe(14);
    expect(result.trialEndDate).toBe("2026-05-15T00:00:00Z");
    expect(result.willCancel).toBe(false);
  });

  it("reports willCancel when the owner cancelled during the trial", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T00:00:00Z"));

    const result = setup({
      plan: "pro",
      subscription: {
        status: "trialing",
        current_period_end: "2026-05-04T00:00:00Z",
        cancel_at_period_end: true,
      },
      trialEndsAt: null,
    });

    expect(result.isTrialActive).toBe(true);
    expect(result.willCancel).toBe(true);
  });

  it("marks Stripe trial inactive when period_end is in the past", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T00:00:00Z"));

    const result = setup({
      plan: "pro",
      subscription: { status: "trialing", current_period_end: "2026-05-15T00:00:00Z" },
      trialEndsAt: null,
    });

    expect(result.isTrialActive).toBe(false);
    expect(result.daysLeft).toBeLessThanOrEqual(0);
  });

  it("ignores the org-level trial_ends_at (future) — there is no org trial", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T00:00:00Z"));

    const result = setup({ plan: "free", subscription: null, trialEndsAt: "2026-05-14T00:00:00Z" });

    expect(result.isTrialActive).toBe(false);
    expect(result.daysLeft).toBeNull();
    expect(result.isStripeTrial).toBe(false);
  });

  it("ignores the org-level trial_ends_at (past) — there is no expired state", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T00:00:00Z"));

    const result = setup({
      plan: "free",
      subscription: { status: "active", plan: "free" },
      trialEndsAt: "2026-05-01T00:00:00Z",
    });

    expect(result.isTrialActive).toBe(false);
    expect(result.daysLeft).toBeNull();
    expect(result).not.toHaveProperty("isTrialExpired");
  });

  it("does not show a trial for a past_due paid org", () => {
    const result = setup({
      plan: "free", // UserProvider derives billed plan 'free' for past_due
      subscription: { status: "past_due", plan: "pro" },
      trialEndsAt: "2026-05-01T00:00:00Z",
    });
    expect(result.isTrialActive).toBe(false);
    expect(result.daysLeft).toBeNull();
  });

  it("returns noop for a trialing row with an unparseable end date", () => {
    const result = setup({
      plan: "pro",
      subscription: { status: "trialing", current_period_end: "not-a-date" },
      trialEndsAt: null,
    });
    expect(result.isTrialActive).toBe(false);
    expect(result.daysLeft).toBeNull();
  });
});
