import { describe, it, expect } from "vitest";
import { hasBillingHistory, isActivePlan, needsPayment, paidPlanOf, statusBadge } from "./billingStatus";

const FREE = { plan: "free", status: "active" }; // default row every org gets

describe("billingStatus", () => {
  it("paidPlanOf", () => {
    expect(paidPlanOf(null)).toBeNull();
    expect(paidPlanOf(FREE)).toBeNull();
    expect(paidPlanOf({ plan: "pro", status: "past_due" })).toBe("pro");
    expect(paidPlanOf({ plan: "team", status: "active" })).toBe("team");
  });

  it("needsPayment only for a paid plan in a failing status", () => {
    expect(needsPayment({ plan: "pro", status: "past_due" })).toBe(true);
    expect(needsPayment({ plan: "team", status: "unpaid" })).toBe(true);
    expect(needsPayment({ plan: "pro", status: "active" })).toBe(false);
    expect(needsPayment({ plan: "free", status: "canceled" })).toBe(false);
    expect(needsPayment(null)).toBe(false);
  });

  it("hasBillingHistory is false for the default free row", () => {
    expect(hasBillingHistory(FREE)).toBe(false);
    expect(hasBillingHistory(null)).toBe(false);
    expect(hasBillingHistory({ plan: "free", status: "canceled" })).toBe(true);
    expect(hasBillingHistory({ plan: "pro", status: "past_due" })).toBe(true);
  });

  it("statusBadge maps raw Stripe statuses to labels", () => {
    expect(statusBadge(FREE)).toBeNull();
    expect(statusBadge({ plan: "pro", status: "active" })).toEqual({ label: "Active", tone: "good" });
    expect(statusBadge({ plan: "pro", status: "trialing" })).toEqual({ label: "Trial", tone: "good" });
    expect(statusBadge({ plan: "pro", status: "past_due" })).toEqual({ label: "Payment failed", tone: "warn" });
    expect(statusBadge({ plan: "free", status: "canceled" })).toEqual({ label: "Cancelled", tone: "neutral" });
    expect(statusBadge({ plan: "pro", status: "something_new" })).toEqual({ label: "Unknown", tone: "neutral" });
  });

  it("isActivePlan", () => {
    expect(isActivePlan({ plan: "pro", status: "trialing" })).toBe(true);
    expect(isActivePlan(FREE)).toBe(false);
    expect(isActivePlan({ plan: "pro", status: "active" }, "team")).toBe(false);
    expect(isActivePlan({ plan: "team", status: "active" }, "team")).toBe(true);
    expect(isActivePlan({ plan: "team", status: "past_due" }, "team")).toBe(false);
  });
});
