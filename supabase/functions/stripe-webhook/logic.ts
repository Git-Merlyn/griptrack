// Pure decision logic for stripe-webhook. No Deno, npm or network imports so
// it can be unit-tested with vitest from the repo root
// (supabase/functions/stripe-webhook/logic.test.ts).

export type PaidPlan = "pro" | "team";

/** Subscription statuses that grant paid access. */
export const LIVE_STATUSES: ReadonlySet<string> = new Set(["active", "trialing"]);
/** Terminal statuses: the subscription will never bill again. */
export const ENDED_STATUSES: ReadonlySet<string> = new Set(["canceled", "incomplete_expired"]);

/**
 * Builds the price -> plan map from env values. Empty or unset values are
 * left out (so two unset vars can no longer collide on the "" key) and are
 * reported in `missing` so the caller can log them once at boot.
 */
export function buildPriceToPlan(env: {
  STRIPE_PRO_PRICE_ID?: string | null;
  STRIPE_TEAM_PRICE_ID?: string | null;
}): { map: Map<string, PaidPlan>; missing: string[] } {
  const map = new Map<string, PaidPlan>();
  const missing: string[] = [];
  const entries: Array<[string, string | null | undefined, PaidPlan]> = [
    ["STRIPE_PRO_PRICE_ID", env.STRIPE_PRO_PRICE_ID, "pro"],
    ["STRIPE_TEAM_PRICE_ID", env.STRIPE_TEAM_PRICE_ID, "team"],
  ];
  for (const [name, raw, plan] of entries) {
    const priceId = (raw ?? "").trim();
    if (!priceId) {
      missing.push(name);
      continue;
    }
    map.set(priceId, plan);
  }
  return { map, missing };
}

/** Returns the id of a Stripe expandable field (string id or expanded object). */
export function idOf(value: unknown): string | null {
  if (typeof value === "string") return value.length > 0 ? value : null;
  if (value && typeof value === "object") {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return null;
}

/**
 * Subscription id of an invoice, for any API version:
 * - before 2025-03-31.basil: `invoice.subscription`
 * - basil and later: `invoice.parent.subscription_details.subscription`
 */
export function subscriptionIdFromInvoice(invoice: unknown): string | null {
  if (!invoice || typeof invoice !== "object") return null;
  const inv = invoice as {
    subscription?: unknown;
    parent?: { subscription_details?: { subscription?: unknown } | null } | null;
  };
  return idOf(inv.subscription) ?? idOf(inv.parent?.subscription_details?.subscription);
}

type PeriodSource = {
  current_period_end?: number | null;
  items?: { data?: Array<{ current_period_end?: number | null } | null> | null } | null;
};

/**
 * Current period end as an ISO string, for any API version:
 * - before basil: `subscription.current_period_end`
 * - basil and later: `subscription.items.data[].current_period_end` (latest wins)
 * Returns null instead of throwing when no usable timestamp exists.
 */
export function periodEndIso(sub: PeriodSource): string | null {
  const top = sub.current_period_end;
  let ts: number | null = typeof top === "number" && Number.isFinite(top) ? top : null;
  if (ts === null) {
    const itemEnds = (sub.items?.data ?? [])
      .map((item) => item?.current_period_end)
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
    ts = itemEnds.length > 0 ? Math.max(...itemEnds) : null;
  }
  if (ts === null) return null;
  const d = new Date(ts * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export type FreshSubscription = PeriodSource & {
  id: string;
  status: string;
  cancel_at_period_end?: boolean | null;
  cancel_at?: number | null;
  items?: {
    data?: Array<{ current_period_end?: number | null; price?: { id?: string | null } | null } | null> | null;
  } | null;
};

export type StoredRow = { stripe_subscription_id: string | null; plan: string | null } | null;

export type WriteDecision =
  | { kind: "skip"; reason: string }
  | {
    kind: "write";
    /** null = leave the stored plan unchanged */
    plan: "free" | PaidPlan | null;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    /** set when the subscription's price is not in the price map */
    unmappedPriceId: string | null;
  };

/**
 * Decides what to write for a freshly re-fetched subscription.
 *
 * - A subscription that is not live and is not the one the org row points at
 *   (row points at another subscription, or at none because delete-account
 *   cleared it): skip, so a late event for an old subscription can never
 *   overwrite the org's current state.
 *   Exception: checkout.session.completed while the org row points at no
 *   subscription adopts it (that event links a new subscription to the org).
 *   A late checkout retry for an old, ended subscription is still skipped
 *   once the row points at a newer subscription.
 * - Ended subscription: plan "free", cancel_at_period_end false.
 * - Otherwise plan from the price map. Unmapped price: keep the stored plan
 *   (plan: null), except on checkout.session.completed where there is no paid
 *   plan yet, which falls back to "pro" (previous behaviour) and is logged.
 */
export function decideWrite(args: {
  fresh: FreshSubscription;
  stored: StoredRow;
  priceToPlan: Map<string, PaidPlan>;
  isCheckout: boolean;
}): WriteDecision {
  const { fresh, stored, priceToPlan, isCheckout } = args;
  const storedSubId = stored?.stripe_subscription_id ?? null;
  const adoptingAtCheckout = isCheckout && storedSubId === null;

  if (storedSubId !== fresh.id && !LIVE_STATUSES.has(fresh.status) && !adoptingAtCheckout) {
    return {
      kind: "skip",
      reason: `org row points at ${storedSubId ?? "no subscription"}; ${fresh.id} is ${fresh.status}`,
    };
  }

  const currentPeriodEnd = periodEndIso(fresh);

  if (ENDED_STATUSES.has(fresh.status)) {
    return {
      kind: "write",
      plan: "free",
      status: fresh.status,
      currentPeriodEnd,
      cancelAtPeriodEnd: false,
      unmappedPriceId: null,
    };
  }

  const priceId = fresh.items?.data?.[0]?.price?.id ?? null;
  const mapped = priceId ? priceToPlan.get(priceId) ?? null : null;
  let plan: "free" | PaidPlan | null = mapped;
  if (!mapped && isCheckout) plan = "pro";

  return {
    kind: "write",
    plan,
    status: fresh.status,
    currentPeriodEnd,
    cancelAtPeriodEnd: fresh.cancel_at_period_end === true ||
      (typeof fresh.cancel_at === "number" && Number.isFinite(fresh.cancel_at)),
    unmappedPriceId: mapped ? null : priceId ?? "(no price)",
  };
}
