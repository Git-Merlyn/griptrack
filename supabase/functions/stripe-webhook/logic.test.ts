// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildPriceToPlan,
  decideWrite,
  idOf,
  periodEndIso,
  subscriptionIdFromInvoice,
  type FreshSubscription,
} from "./logic.ts";

const PRO = "price_pro_test";
const TEAM = "price_team_test";
const { map: priceToPlan } = buildPriceToPlan({
  STRIPE_PRO_PRICE_ID: PRO,
  STRIPE_TEAM_PRICE_ID: TEAM,
});

// 2026-11-21T00:00:00.000Z
const PERIOD_END = 1795219200;
const PERIOD_END_ISO = "2026-11-21T00:00:00.000Z";

function sub(overrides: Partial<FreshSubscription> = {}): FreshSubscription {
  return {
    id: "sub_A",
    status: "active",
    cancel_at_period_end: false,
    cancel_at: null,
    items: { data: [{ current_period_end: PERIOD_END, price: { id: PRO } }] },
    ...overrides,
  };
}

describe("buildPriceToPlan (L76)", () => {
  it("maps both configured prices", () => {
    const { map, missing } = buildPriceToPlan({ STRIPE_PRO_PRICE_ID: PRO, STRIPE_TEAM_PRICE_ID: TEAM });
    expect(map.get(PRO)).toBe("pro");
    expect(map.get(TEAM)).toBe("team");
    expect(missing).toEqual([]);
  });

  it("never creates an empty-string key when env vars are unset", () => {
    const { map, missing } = buildPriceToPlan({ STRIPE_PRO_PRICE_ID: undefined, STRIPE_TEAM_PRICE_ID: "  " });
    expect(map.size).toBe(0);
    expect(map.has("")).toBe(false);
    expect(missing).toEqual(["STRIPE_PRO_PRICE_ID", "STRIPE_TEAM_PRICE_ID"]);
  });
});

describe("idOf", () => {
  it("accepts a string id or an expanded object", () => {
    expect(idOf("sub_1")).toBe("sub_1");
    expect(idOf({ id: "sub_2", object: "subscription" })).toBe("sub_2");
  });
  it("returns null for empty or missing values", () => {
    expect(idOf("")).toBeNull();
    expect(idOf(null)).toBeNull();
    expect(idOf(undefined)).toBeNull();
    expect(idOf({})).toBeNull();
  });
});

describe("subscriptionIdFromInvoice (M25)", () => {
  it("reads the pre-basil invoice.subscription field", () => {
    expect(subscriptionIdFromInvoice({ subscription: "sub_old" })).toBe("sub_old");
  });
  it("reads the basil+ invoice.parent.subscription_details.subscription field", () => {
    expect(
      subscriptionIdFromInvoice({
        parent: { type: "subscription_details", subscription_details: { subscription: "sub_new" } },
      }),
    ).toBe("sub_new");
  });
  it("accepts an expanded subscription object", () => {
    expect(
      subscriptionIdFromInvoice({ parent: { subscription_details: { subscription: { id: "sub_exp" } } } }),
    ).toBe("sub_exp");
  });
  it("returns null for a one-off invoice", () => {
    expect(subscriptionIdFromInvoice({ subscription: null, parent: null })).toBeNull();
    expect(subscriptionIdFromInvoice(null)).toBeNull();
  });
});

describe("periodEndIso (M25)", () => {
  it("reads the pre-basil top-level field", () => {
    expect(periodEndIso({ current_period_end: PERIOD_END })).toBe(PERIOD_END_ISO);
  });
  it("reads the basil+ item-level field and takes the latest item", () => {
    expect(
      periodEndIso({ items: { data: [{ current_period_end: PERIOD_END - 86400 }, { current_period_end: PERIOD_END }] } }),
    ).toBe(PERIOD_END_ISO);
  });
  it("returns null instead of throwing when no timestamp exists", () => {
    expect(periodEndIso({})).toBeNull();
    expect(periodEndIso({ current_period_end: undefined, items: { data: [] } })).toBeNull();
    expect(periodEndIso({ current_period_end: Number.NaN })).toBeNull();
  });
});

describe("decideWrite (M24 ordering, L76 unmapped price)", () => {
  it("writes the mapped plan for a live subscription", () => {
    const d = decideWrite({
      fresh: sub({ items: { data: [{ current_period_end: PERIOD_END, price: { id: TEAM } }] } }),
      stored: { stripe_subscription_id: "sub_A", plan: "pro" },
      priceToPlan,
      isCheckout: false,
    });
    expect(d).toEqual({
      kind: "write",
      plan: "team",
      status: "active",
      currentPeriodEnd: PERIOD_END_ISO,
      cancelAtPeriodEnd: false,
      unmappedPriceId: null,
    });
  });

  it("a stale 'active' event replayed after cancellation writes the fresh canceled state", () => {
    // The event payload said active; the re-fetched subscription says canceled.
    const d = decideWrite({
      fresh: sub({ status: "canceled" }),
      stored: { stripe_subscription_id: "sub_A", plan: "free" },
      priceToPlan,
      isCheckout: false,
    });
    expect(d.kind).toBe("write");
    if (d.kind !== "write") return;
    expect(d.plan).toBe("free");
    expect(d.status).toBe("canceled");
    expect(d.cancelAtPeriodEnd).toBe(false);
  });

  it("skips a superseded subscription that is no longer live", () => {
    const d = decideWrite({
      fresh: sub({ id: "sub_OLD", status: "canceled" }),
      stored: { stripe_subscription_id: "sub_NEW", plan: "pro" },
      priceToPlan,
      isCheckout: false,
    });
    expect(d.kind).toBe("skip");
  });

  it("skips a superseded past_due subscription", () => {
    const d = decideWrite({
      fresh: sub({ id: "sub_OLD", status: "past_due" }),
      stored: { stripe_subscription_id: "sub_NEW", plan: "pro" },
      priceToPlan,
      isCheckout: false,
    });
    expect(d.kind).toBe("skip");
  });

  it("a late checkout.session.completed retry for an ended subscription does not replace a newer one", () => {
    const d = decideWrite({
      fresh: sub({ id: "sub_OLD", status: "canceled" }),
      stored: { stripe_subscription_id: "sub_NEW", plan: "pro" },
      priceToPlan,
      isCheckout: true,
    });
    expect(d.kind).toBe("skip");
  });

  it("checkout adopts a not-yet-live subscription when the org row points at none", () => {
    const d = decideWrite({
      fresh: sub({ status: "incomplete" }),
      stored: { stripe_subscription_id: null, plan: "free" },
      priceToPlan,
      isCheckout: true,
    });
    expect(d).toMatchObject({ kind: "write", plan: "pro", status: "incomplete" });
  });

  it("ignores an ended subscription when the org row points at none (cleared by delete-account)", () => {
    const d = decideWrite({
      fresh: sub({ status: "canceled" }),
      stored: { stripe_subscription_id: null, plan: "free" },
      priceToPlan,
      isCheckout: false,
    });
    expect(d.kind).toBe("skip");
  });

  it("ignores an ended subscription when the org row no longer exists", () => {
    const d = decideWrite({ fresh: sub({ status: "canceled" }), stored: null, priceToPlan, isCheckout: false });
    expect(d.kind).toBe("skip");
  });

  it("lets a different but live subscription take over the org row", () => {
    const d = decideWrite({
      fresh: sub({ id: "sub_NEW", status: "trialing" }),
      stored: { stripe_subscription_id: "sub_OLD", plan: "free" },
      priceToPlan,
      isCheckout: false,
    });
    expect(d.kind).toBe("write");
  });

  it("writes when the org row has no subscription yet", () => {
    const d = decideWrite({
      fresh: sub({ status: "trialing" }),
      stored: { stripe_subscription_id: null, plan: "free" },
      priceToPlan,
      isCheckout: true,
    });
    expect(d).toMatchObject({ kind: "write", plan: "pro", status: "trialing" });
  });

  it("keeps the stored plan for an unmapped price outside checkout", () => {
    const d = decideWrite({
      fresh: sub({ items: { data: [{ current_period_end: PERIOD_END, price: { id: "price_unknown" } }] } }),
      stored: { stripe_subscription_id: "sub_A", plan: "team" },
      priceToPlan,
      isCheckout: false,
    });
    expect(d).toMatchObject({ kind: "write", plan: null, unmappedPriceId: "price_unknown" });
  });

  it("falls back to pro for an unmapped price on checkout.session.completed", () => {
    const d = decideWrite({
      fresh: sub({ items: { data: [{ current_period_end: PERIOD_END, price: { id: "price_unknown" } }] } }),
      stored: { stripe_subscription_id: null, plan: "free" },
      priceToPlan,
      isCheckout: true,
    });
    expect(d).toMatchObject({ kind: "write", plan: "pro", unmappedPriceId: "price_unknown" });
  });

  it("treats a scheduled cancel_at as cancelling", () => {
    const d = decideWrite({
      fresh: sub({ cancel_at_period_end: false, cancel_at: PERIOD_END }),
      stored: { stripe_subscription_id: "sub_A", plan: "pro" },
      priceToPlan,
      isCheckout: false,
    });
    expect(d).toMatchObject({ kind: "write", cancelAtPeriodEnd: true });
  });

  it("writes a null period end instead of throwing when Stripe omits it", () => {
    const d = decideWrite({
      fresh: sub({ items: { data: [{ price: { id: PRO } }] } }),
      stored: { stripe_subscription_id: "sub_A", plan: "pro" },
      priceToPlan,
      isCheckout: false,
    });
    expect(d).toMatchObject({ kind: "write", plan: "pro", currentPeriodEnd: null });
  });
});
