// src/lib/plan.js
// Single source of truth (web) for plan gating — audit M9, WP09 Option A.
// Mirrors public.org_effective_plan() in
// supabase/migrations/20261021090000_plan_limits.sql. Keep the two in sync.
//
// Effective plan: subscription.plan is pro/team and its status is
// active, trialing or past_due -> that plan; anything else -> "free".
// There is no org-level trial: organizations.trial_ends_at grants nothing.
// The only trial is Stripe Checkout's (card required), i.e. status "trialing".

export const PLAN_RANK = { free: 0, pro: 1, team: 2 };

const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);

export const FREE_LIMITS = Object.freeze({ items: 50, activeLocations: 1 });
export const PRO_STAFF_LIMIT = 5;

/**
 * @param {{ subscription: {plan?: string, status?: string}|null }} args
 * @returns {"free"|"pro"|"team"}
 */
export function computeEffectivePlan({ subscription }) {
  const subPlan = subscription?.plan;
  if ((subPlan === "pro" || subPlan === "team") && PAID_STATUSES.has(subscription?.status)) {
    return subPlan;
  }
  return "free";
}

/** True when `plan` is at least `requiredPlan`. Unknown plans count as free. */
export function planAllows(plan, requiredPlan = "pro") {
  return (PLAN_RANK[plan] ?? 0) >= (PLAN_RANK[requiredPlan] ?? 0);
}

// ── Server plan-limit errors ────────────────────────────────────────────
// The DB trigger (and parse-rental-pdf) word their errors neutrally, because
// the same text is shown inside the iOS/Android apps: every message starts
// with "Plan limit: " and carries the code "plan_limit:<name>" (PostgREST
// `hint`, or `code` in an edge-function JSON body). Only the web adds an
// upgrade call-to-action, here.

const PLAN_LIMIT_MESSAGE_PREFIX = "Plan limit:";
const PLAN_LIMIT_CODE_PREFIX = "plan_limit:";

export const PLAN_LIMIT_WEB_CTA =
  "The organization owner can upgrade the plan from the Billing page.";

/**
 * "items" | "locations" | "invites" | "seats" | "pdf_import" | "unknown" for a
 * server plan-limit error (an Error, a PostgREST error object or a plain
 * message string); null for anything else.
 */
export function planLimitOf(err) {
  if (!err) return null;
  for (const field of [err.hint, err.code]) {
    if (typeof field === "string" && field.startsWith(PLAN_LIMIT_CODE_PREFIX)) {
      return field.slice(PLAN_LIMIT_CODE_PREFIX.length) || "unknown";
    }
  }
  const message = typeof err === "string" ? err : err.message;
  if (typeof message === "string" && message.startsWith(PLAN_LIMIT_MESSAGE_PREFIX)) {
    return "unknown";
  }
  return null;
}

/**
 * Web-only display text for a plan-limit error: the server's neutral message
 * plus the upgrade call-to-action. Returns null when `err` is not a plan-limit
 * error, so callers can write `planLimitMessage(err) ?? err.message`.
 */
export function planLimitMessage(err) {
  if (!planLimitOf(err)) return null;
  const message = (typeof err === "string" ? err : err.message) || "Plan limit reached.";
  return `${message} ${PLAN_LIMIT_WEB_CTA}`;
}

/** Web text for a Pro-only action the user just tried on the Free plan. */
export const proFeatureMessage = (featureName) =>
  `${featureName} is a Pro feature. ${PLAN_LIMIT_WEB_CTA}`;

/** Shown in the import dialog when a Free org picks a PDF (CSV stays free). */
export const PDF_IMPORT_PRO_MESSAGE =
  `PDF import is a Pro feature. CSV import works on every plan. ${PLAN_LIMIT_WEB_CTA}`;
