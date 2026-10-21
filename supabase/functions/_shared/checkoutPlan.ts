// Pure request/decision logic for the create-checkout-session edge function.
// No Deno, Supabase or Stripe imports, so the web vitest suite can unit-test it
// (see checkoutPlan.test.ts next to this file). The edge function imports it
// as "../_shared/checkoutPlan.ts".

export const PLAN_KEYS = ["pro", "team"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

// Stripe subscription statuses where Stripe is still billing, or still trying
// to bill, the customer. While one of these exists we must never open a new
// Checkout: it would create a second subscription on the same customer.
export const LIVE_STATUSES: ReadonlySet<string> = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
  "paused",
]);

// Live statuses where the owner has to fix payment in the Customer Portal
// before any plan change is allowed.
export const NEEDS_PAYMENT_STATUSES: ReadonlySet<string> = new Set([
  "past_due",
  "unpaid",
  "incomplete",
  "paused",
]);

export type ParsedCheckoutRequest =
  | { ok: true; plan: PlanKey; confirmSwitch: boolean }
  | { ok: false; status: 400; error: string };

/** Validates the raw request body. Never echoes caller input back. */
export function parseCheckoutRequest(rawBody: string): ParsedCheckoutRequest {
  let body: unknown;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return { ok: false, status: 400, error: "Request body must be JSON." };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, error: "Request body must be a JSON object." };
  }
  const { plan, interval, confirmSwitch } = body as Record<string, unknown>;
  // Array membership on a string: prototype keys such as "constructor" or
  // "__proto__" can never match (the old PRICE_IDS[plan] lookup let them through).
  if (typeof plan !== "string" || !(PLAN_KEYS as readonly string[]).includes(plan)) {
    return { ok: false, status: 400, error: "Unknown plan." };
  }
  // There are no annual Stripe prices yet. Refuse loudly rather than silently
  // charging the monthly price (audit M2).
  if (interval !== undefined && interval !== null && interval !== "monthly") {
    return { ok: false, status: 400, error: "Annual billing is not available yet." };
  }
  // Only the literal boolean true counts. The web client sends it after the
  // owner confirmed a plan switch; older clients never send it.
  return { ok: true, plan: plan as PlanKey, confirmSwitch: confirmSwitch === true };
}

/** Price id for a plan from env values; null when unset or blank. */
export function resolvePriceId(
  plan: PlanKey,
  prices: { pro?: string | null; team?: string | null },
): string | null {
  const id = plan === "pro" ? prices.pro : prices.team;
  return typeof id === "string" && id.trim() !== "" ? id.trim() : null;
}

/** The fields of a Stripe subscription the decision needs. */
export type StripeSubLite = {
  id: string;
  status: string;
  itemId: string | null;
  priceId: string | null;
};

export type RejectCode =
  | "multiple_subscriptions"
  | "payment_required"
  | "already_on_plan"
  | "confirm_switch"
  | "manage_in_portal";

export type CheckoutDecision =
  | { kind: "checkout"; trial: boolean }
  | { kind: "update"; subscriptionId: string; itemId: string }
  | { kind: "reject"; status: 409; code: RejectCode; error: string };

/**
 * Decides what a "start checkout for <price>" request should do, given every
 * subscription Stripe has for the org's customer (any status) and the
 * subscription id stored in public.subscriptions. `confirmSwitch` must be
 * true for an in-place plan change: a caller that did not ask the owner to
 * confirm (stale page, old cached client) gets a 409 instead of a charge.
 */
export function decideCheckout(args: {
  priceId: string;
  subscriptions: StripeSubLite[];
  dbSubscriptionId: string | null;
  confirmSwitch?: boolean;
}): CheckoutDecision {
  const live = args.subscriptions.filter((s) => LIVE_STATUSES.has(s.status));

  if (live.length > 1) {
    return {
      kind: "reject",
      status: 409,
      code: "multiple_subscriptions",
      error:
        "Your organization has more than one active subscription. Use Manage subscription to cancel the extra one, or contact support.",
    };
  }

  if (live.length === 1) {
    const sub = live[0];
    if (NEEDS_PAYMENT_STATUSES.has(sub.status)) {
      return {
        kind: "reject",
        status: 409,
        code: "payment_required",
        error: "Your last payment failed. Update your payment method under Manage subscription first.",
      };
    }
    if (sub.priceId === args.priceId) {
      return {
        kind: "reject",
        status: 409,
        code: "already_on_plan",
        error: "Your organization is already on this plan.",
      };
    }
    if (args.confirmSwitch !== true) {
      return {
        kind: "reject",
        status: 409,
        code: "confirm_switch",
        error:
          "Your organization already has a subscription, so this would change its plan. Reload the Billing page and confirm the change there.",
      };
    }
    if (!sub.itemId) {
      return {
        kind: "reject",
        status: 409,
        code: "manage_in_portal",
        error: "This subscription can't be changed here. Use Manage subscription.",
      };
    }
    return { kind: "update", subscriptionId: sub.id, itemId: sub.itemId };
  }

  // No live subscription: a new Checkout. Only an org that has never had a
  // subscription (none in Stripe, none recorded in the DB) gets the trial.
  const trial = args.subscriptions.length === 0 && !args.dbSubscriptionId;
  return { kind: "checkout", trial };
}
