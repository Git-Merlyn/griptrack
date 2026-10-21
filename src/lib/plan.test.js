import { describe, it, expect } from "vitest";
import {
  computeEffectivePlan,
  planAllows,
  planLimitOf,
  planLimitMessage,
  proFeatureMessage,
  PLAN_LIMIT_WEB_CTA,
} from "./plan";

describe("computeEffectivePlan", () => {
  it.each([
    [{ plan: "pro", status: "active" }, "pro"],
    [{ plan: "team", status: "trialing" }, "team"],
    [{ plan: "pro", status: "trialing" }, "pro"],
    [{ plan: "pro", status: "past_due" }, "pro"],
    [{ plan: "pro", status: "canceled" }, "free"],
    [{ plan: "pro", status: "unpaid" }, "free"],
    [{ plan: "team", status: "incomplete" }, "free"],
    [{ plan: "free", status: "active" }, "free"],
    [null, "free"],
  ])("subscription=%j -> %s", (subscription, expected) => {
    expect(computeEffectivePlan({ subscription })).toBe(expected);
  });

  it("ignores organizations.trial_ends_at entirely (no org trial)", () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      computeEffectivePlan({ subscription: { plan: "free", status: "active" }, trialEndsAt: future }),
    ).toBe("free");
  });
});

describe("planAllows", () => {
  it("ranks free < pro < team", () => {
    expect(planAllows("free", "pro")).toBe(false);
    expect(planAllows("pro", "pro")).toBe(true);
    expect(planAllows("team", "pro")).toBe(true);
    expect(planAllows("pro", "team")).toBe(false);
    expect(planAllows(undefined, "pro")).toBe(false);
  });
});

describe("planLimitOf / planLimitMessage", () => {
  const dbError = {
    code: "P0001",
    hint: "plan_limit:items",
    message: "Plan limit: this organization's plan allows up to 50 equipment items.",
  };

  it("reads the PostgREST hint", () => {
    expect(planLimitOf(dbError)).toBe("items");
  });

  it("reads an edge-function body code", () => {
    expect(planLimitOf({ code: "plan_limit:pdf_import", message: "x" })).toBe("pdf_import");
  });

  it("falls back to the message prefix (invite-staff forwards only the message)", () => {
    const err = new Error("Plan limit: this organization's plan allows up to 5 staff members.");
    expect(planLimitOf(err)).toBe("unknown");
    expect(planLimitOf(err.message)).toBe("unknown");
  });

  it("returns null for other errors", () => {
    expect(planLimitOf(null)).toBeNull();
    expect(planLimitOf({ code: "23505", message: "duplicate key value" })).toBeNull();
    expect(planLimitOf(new Error("Admins only"))).toBeNull();
    expect(planLimitMessage(new Error("Admins only"))).toBeNull();
  });

  it("adds the web-only upgrade call-to-action to the neutral server text", () => {
    expect(planLimitMessage(dbError)).toBe(`${dbError.message} ${PLAN_LIMIT_WEB_CTA}`);
  });

  it("words Pro-only actions for the web", () => {
    expect(proFeatureMessage("Audit history export")).toBe(
      `Audit history export is a Pro feature. ${PLAN_LIMIT_WEB_CTA}`,
    );
  });
});
