// Display rules for the org's subscriptions row ({ plan, status, ... }).
// Every org has a row from birth (plan 'free', status 'active'), so "has a
// row" does not mean "has paid". Never read stripe_* ids here: WP04 (L68)
// removes them from what the client can select.

export const PLAN_LABELS = { free: "Free", pro: "Pro", team: "Team" };
export const PLAN_PRICES = { free: "$0", pro: "$39/month", team: "$89/month" };

const STATUS_LABELS = {
  active: "Active",
  trialing: "Trial",
  past_due: "Payment failed",
  unpaid: "Unpaid",
  incomplete: "Payment incomplete",
  incomplete_expired: "Expired",
  canceled: "Cancelled",
  paused: "Paused",
};

export const ACTIVE_STATUSES = new Set(["active", "trialing"]);
// Must match NEEDS_PAYMENT_STATUSES in supabase/functions/_shared/checkoutPlan.ts.
export const NEEDS_PAYMENT_STATUSES = new Set(["past_due", "unpaid", "incomplete", "paused"]);

/** 'pro' | 'team' when the row names a paid plan (any status), else null. */
export const paidPlanOf = (sub) => (sub?.plan === "pro" || sub?.plan === "team" ? sub.plan : null);

/** A paid subscription exists but Stripe cannot collect payment. */
export const needsPayment = (sub) => !!sub && !!paidPlanOf(sub) && NEEDS_PAYMENT_STATUSES.has(sub.status);

/** The org has had a Stripe subscription at some point (portal has something to show). */
export const hasBillingHistory = (sub) =>
  !!sub && (paidPlanOf(sub) !== null || (!!sub.status && sub.status !== "active"));

/** Badge for the plan card, or null for a plain free org. tone: good | warn | neutral. */
export function statusBadge(sub) {
  if (!sub?.status) return null;
  if (!paidPlanOf(sub) && sub.status === "active") return null;
  const label = STATUS_LABELS[sub.status] ?? "Unknown";
  const tone = ACTIVE_STATUSES.has(sub.status)
    ? "good"
    : NEEDS_PAYMENT_STATUSES.has(sub.status)
      ? "warn"
      : "neutral";
  return { label, tone };
}

/** Polling predicate: row shows `plan` (or any paid plan when omitted) as active/trialing. */
export const isActivePlan = (sub, plan) =>
  !!sub && ACTIVE_STATUSES.has(sub.status) && (plan ? sub.plan === plan : paidPlanOf(sub) !== null);
