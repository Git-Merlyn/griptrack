// @vitest-environment node
// Runs in the web vitest suite (vitest.config.js only excludes node_modules
// and mobile/). Keep this file free of Deno APIs.
import { describe, it, expect } from "vitest";
import {
  decideCheckout,
  parseCheckoutRequest,
  resolvePriceId,
  type StripeSubLite,
} from "./checkoutPlan.ts";

const sub = (over: Partial<StripeSubLite> = {}): StripeSubLite => ({
  id: "sub_1",
  status: "active",
  itemId: "si_1",
  priceId: "price_pro",
  ...over,
});

describe("parseCheckoutRequest", () => {
  it("accepts pro and team", () => {
    expect(parseCheckoutRequest('{"plan":"pro"}')).toEqual({ ok: true, plan: "pro", confirmSwitch: false });
    expect(parseCheckoutRequest('{"plan":"team"}')).toEqual({ ok: true, plan: "team", confirmSwitch: false });
  });

  it("accepts an explicit monthly interval", () => {
    expect(parseCheckoutRequest('{"plan":"pro","interval":"monthly"}')).toEqual({
      ok: true,
      plan: "pro",
      confirmSwitch: false,
    });
  });

  it("confirmSwitch is true only for the literal boolean true", () => {
    expect(parseCheckoutRequest('{"plan":"team","confirmSwitch":true}')).toEqual({
      ok: true,
      plan: "team",
      confirmSwitch: true,
    });
    expect(parseCheckoutRequest('{"plan":"team","confirmSwitch":"true"}')).toMatchObject({ confirmSwitch: false });
    expect(parseCheckoutRequest('{"plan":"team","confirmSwitch":1}')).toMatchObject({ confirmSwitch: false });
  });

  it.each([
    ["empty body", ""],
    ["malformed JSON", "{oops"],
    ["JSON null", "null"],
    ["JSON array", "[]"],
    ["JSON string", '"pro"'],
  ])("rejects %s with 400", (_label, raw) => {
    const r = parseCheckoutRequest(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it.each(["constructor", "__proto__", "toString", "hasOwnProperty", "free", "PRO", ""])(
    "rejects plan %j without echoing it",
    (plan) => {
      const r = parseCheckoutRequest(JSON.stringify({ plan }));
      expect(r).toEqual({ ok: false, status: 400, error: "Unknown plan." });
    },
  );

  it("rejects a non-string plan", () => {
    expect(parseCheckoutRequest('{"plan":42}')).toEqual({ ok: false, status: 400, error: "Unknown plan." });
    expect(parseCheckoutRequest('{"plan":["pro"]}')).toEqual({ ok: false, status: 400, error: "Unknown plan." });
  });

  it("rejects annual (no annual prices exist)", () => {
    expect(parseCheckoutRequest('{"plan":"pro","interval":"annual"}')).toEqual({
      ok: false,
      status: 400,
      error: "Annual billing is not available yet.",
    });
  });
});

describe("resolvePriceId", () => {
  it("maps each plan to its env price", () => {
    expect(resolvePriceId("pro", { pro: "price_pro", team: "price_team" })).toBe("price_pro");
    expect(resolvePriceId("team", { pro: "price_pro", team: "price_team" })).toBe("price_team");
  });

  it("returns null for unset or blank env values", () => {
    expect(resolvePriceId("pro", {})).toBeNull();
    expect(resolvePriceId("pro", { pro: "" })).toBeNull();
    expect(resolvePriceId("team", { team: "   " })).toBeNull();
    expect(resolvePriceId("team", { team: null })).toBeNull();
  });
});

describe("decideCheckout", () => {
  it("never-subscribed org: checkout with trial", () => {
    expect(decideCheckout({ priceId: "price_pro", subscriptions: [], dbSubscriptionId: null })).toEqual({
      kind: "checkout",
      trial: true,
    });
  });

  it("previously canceled org: checkout without a second trial", () => {
    expect(
      decideCheckout({ priceId: "price_pro", subscriptions: [sub({ status: "canceled" })], dbSubscriptionId: "sub_1" }),
    ).toEqual({ kind: "checkout", trial: false });
  });

  it("DB remembers a subscription Stripe no longer lists: still no trial", () => {
    expect(decideCheckout({ priceId: "price_pro", subscriptions: [], dbSubscriptionId: "sub_old" })).toEqual({
      kind: "checkout",
      trial: false,
    });
  });

  it("incomplete_expired only: checkout, no trial", () => {
    expect(
      decideCheckout({ priceId: "price_pro", subscriptions: [sub({ status: "incomplete_expired" })], dbSubscriptionId: null }),
    ).toEqual({ kind: "checkout", trial: false });
  });

  it.each(["past_due", "unpaid", "incomplete", "paused"])("%s subscription: 409 payment_required, no checkout", (status) => {
    const d = decideCheckout({ priceId: "price_team", subscriptions: [sub({ status })], dbSubscriptionId: "sub_1" });
    expect(d).toMatchObject({ kind: "reject", status: 409, code: "payment_required" });
  });

  it.each(["active", "trialing"])("%s on the same price: 409 already_on_plan", (status) => {
    const d = decideCheckout({ priceId: "price_pro", subscriptions: [sub({ status })], dbSubscriptionId: "sub_1" });
    expect(d).toMatchObject({ kind: "reject", status: 409, code: "already_on_plan" });
  });

  it.each(["active", "trialing"])("%s on another price, confirmed: update in place", (status) => {
    const d = decideCheckout({
      priceId: "price_team",
      subscriptions: [sub({ status })],
      dbSubscriptionId: "sub_1",
      confirmSwitch: true,
    });
    expect(d).toEqual({ kind: "update", subscriptionId: "sub_1", itemId: "si_1" });
  });

  it("another price without confirmSwitch: 409 confirm_switch, never an update", () => {
    const d = decideCheckout({ priceId: "price_team", subscriptions: [sub()], dbSubscriptionId: null });
    expect(d).toMatchObject({ kind: "reject", status: 409, code: "confirm_switch" });
  });

  it("uses Stripe even when the DB row has not caught up (webhook lag)", () => {
    const d = decideCheckout({ priceId: "price_pro", subscriptions: [sub({ status: "active" })], dbSubscriptionId: null });
    expect(d).toMatchObject({ kind: "reject", code: "already_on_plan" });
  });

  it("ignores canceled history next to one live subscription", () => {
    const d = decideCheckout({
      priceId: "price_team",
      subscriptions: [sub({ id: "sub_old", status: "canceled" }), sub({ id: "sub_new", itemId: "si_new" })],
      dbSubscriptionId: "sub_new",
      confirmSwitch: true,
    });
    expect(d).toEqual({ kind: "update", subscriptionId: "sub_new", itemId: "si_new" });
  });

  it("two live subscriptions: 409 multiple_subscriptions", () => {
    const d = decideCheckout({
      priceId: "price_team",
      subscriptions: [sub({ id: "sub_a" }), sub({ id: "sub_b", status: "past_due" })],
      dbSubscriptionId: "sub_b",
    });
    expect(d).toMatchObject({ kind: "reject", status: 409, code: "multiple_subscriptions" });
  });

  it("live subscription without an item id: 409 manage_in_portal", () => {
    const d = decideCheckout({
      priceId: "price_team",
      subscriptions: [sub({ itemId: null })],
      dbSubscriptionId: "sub_1",
      confirmSwitch: true,
    });
    expect(d).toMatchObject({ kind: "reject", status: 409, code: "manage_in_portal" });
  });
});
