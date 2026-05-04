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

  it("returns inactive noop when on a paid active plan", () => {
    const result = setup({ plan: "pro", subscription: { status: "active" }, trialEndsAt: "2026-12-01" });
    expect(result.isTrialActive).toBe(false);
    expect(result.isTrialExpired).toBe(false);
    expect(result.daysLeft).toBeNull();
    expect(result.trialEndDate).toBeNull();
  });

  it("returns Stripe trial state when subscription.status === 'trialing' with future end", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T00:00:00Z"));

    const result = setup({
      plan: "free",
      subscription: { status: "trialing", current_period_end: "2026-05-15T00:00:00Z" },
      trialEndsAt: null,
    });

    expect(result.isTrialActive).toBe(true);
    expect(result.isStripeTrial).toBe(true);
    expect(result.daysLeft).toBeGreaterThan(0);
    expect(result.trialEndDate).toBe("2026-05-15T00:00:00Z");
  });

  it("marks Stripe trial inactive when period_end is in the past", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T00:00:00Z"));

    const result = setup({
      plan: "free",
      subscription: { status: "trialing", current_period_end: "2026-05-15T00:00:00Z" },
      trialEndsAt: null,
    });

    expect(result.isTrialActive).toBe(false);
    expect(result.daysLeft).toBeLessThanOrEqual(0);
  });

  it("returns org trial state when plan === 'free' and trialEndsAt is in future", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T00:00:00Z"));

    const result = setup({ plan: "free", subscription: null, trialEndsAt: "2026-05-14T00:00:00Z" });

    expect(result.isTrialActive).toBe(true);
    expect(result.isStripeTrial).toBe(false);
    expect(result.daysLeft).toBeGreaterThan(0);
    expect(result.trialEndDate).toBe("2026-05-14T00:00:00Z");
  });

  it("marks isTrialExpired when org trial is in the past", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T00:00:00Z"));

    const result = setup({ plan: "free", subscription: null, trialEndsAt: "2026-05-01T00:00:00Z" });

    expect(result.isTrialActive).toBe(false);
    expect(result.isTrialExpired).toBe(true);
    expect(result.daysLeft).toBeLessThanOrEqual(0);
  });

  it("returns noop for free plan with no trialEndsAt", () => {
    const result = setup({ plan: "free", subscription: null, trialEndsAt: null });
    expect(result.isTrialActive).toBe(false);
    expect(result.isTrialExpired).toBe(false);
    expect(result.daysLeft).toBeNull();
  });

  it("returns noop for invalid/unparseable trialEndsAt", () => {
    const result = setup({ plan: "free", subscription: null, trialEndsAt: "not-a-date" });
    expect(result.isTrialActive).toBe(false);
    expect(result.isTrialExpired).toBe(false);
  });

  it("Stripe trial isTrialExpired is always false (Stripe manages expiry)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T00:00:00Z"));

    const result = setup({
      plan: "free",
      subscription: { status: "trialing", current_period_end: "2026-05-01T00:00:00Z" },
      trialEndsAt: null,
    });

    expect(result.isTrialExpired).toBe(false);
  });
});
