import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import useUser from "@/context/useUser";
import useConfirm from "@/hooks/useConfirm";
import { redirectToCheckout, redirectToCustomerPortal } from "@/lib/stripe";
import {
  PLAN_LABELS,
  PLAN_PRICES,
  hasBillingHistory,
  isActivePlan,
  needsPayment,
  paidPlanOf,
  statusBadge,
} from "@/lib/billingStatus";

// The stripe-webhook usually writes public.subscriptions within a few seconds
// of Stripe redirecting back. Poll at 0, 2, 5, 10 and 20 s (cumulative), then give up.
const POLL_DELAYS_MS = [0, 2000, 3000, 5000, 10000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Re-reads the subscription until isDone(row) or the delays run out.
// Resolves true (done), false (gave up) or null (cancelled).
const pollSubscription = async (refresh, isDone, isCancelled) => {
  for (const delay of POLL_DELAYS_MS) {
    if (delay) await sleep(delay);
    if (isCancelled()) return null;
    const row = await refresh({ silent: true });
    if (isCancelled()) return null;
    if (isDone(row)) return true;
  }
  return false;
};

const NOTICE_STYLES = {
  info: "text-sky-300 bg-sky-900/20 border-sky-900/40",
  success: "text-green-400 bg-green-900/20 border-green-900/40",
  warn: "text-yellow-400 bg-yellow-900/20 border-yellow-900/40",
};

const BADGE_STYLES = {
  good: "bg-green-900/50 text-green-400 light:bg-green-100 light:text-green-800",
  warn: "bg-yellow-900/50 text-yellow-400 light:bg-amber-100 light:text-amber-800",
  neutral: "bg-gray-800 text-gray-400",
};

const STILL_PENDING =
  "Your payment went through, but your plan has not updated yet. Refresh this page in a minute; contact support if it still shows the old plan.";

const BillingPage = () => {
  const { plan, role, subscription, loadingSubscription, refreshSubscription } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [confirm, confirmDialog] = useConfirm();
  const [upgrading, setUpgrading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null); // { tone, text }
  const [activating, setActivating] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Stripe Checkout returns to /billing?success=true or /billing?canceled=true.
  // Read the flag once, clear it from the URL, and wait for the webhook.
  useEffect(() => {
    const success = searchParams.get("success") === "true";
    const canceled = searchParams.get("canceled") === "true";
    if (!success && !canceled) return undefined;

    setSearchParams({}, { replace: true });

    if (canceled) {
      setNotice({ tone: "info", text: "Checkout canceled. You have not been charged." });
      return undefined;
    }

    let cancelled = false;
    setActivating(true);
    setNotice({ tone: "info", text: "Payment received. Activating your plan…" });
    pollSubscription(refreshSubscription, (row) => isActivePlan(row), () => cancelled).then((done) => {
      if (done === null) return;
      setActivating(false);
      setNotice(
        done
          ? { tone: "success", text: "Your plan is active. Thank you!" }
          : { tone: "warn", text: STILL_PENDING },
      );
    });
    return () => {
      cancelled = true;
    };
    // Runs once per landing: the flags are cleared from the URL above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePlan = async (targetPlan) => {
    // A live subscription is switched in place by the server (no second
    // Checkout), so confirm before changing what the card is charged.
    const isSwitch = plan !== "free";
    if (
      isSwitch &&
      !(await confirm({
        title: `Switch to ${PLAN_LABELS[targetPlan]}?`,
        message: `Switch to ${PLAN_LABELS[targetPlan]} (${PLAN_PRICES[targetPlan]})? The prorated difference is added to your next invoice.`,
        confirmLabel: `Switch to ${PLAN_LABELS[targetPlan]}`,
      }))
    ) {
      return;
    }

    setError("");
    setNotice(null);
    setUpgrading(true);
    try {
      // confirmSwitch tells the server the owner approved an in-place switch.
      // For a free org it stays false, so a Stripe subscription the page did
      // not know about yields a 409 rather than an unconfirmed plan change.
      const result = await redirectToCheckout(targetPlan, { confirmSwitch: isSwitch });
      if (result?.updated) {
        setActivating(true);
        setNotice({ tone: "info", text: `Switching to ${PLAN_LABELS[targetPlan]}…` });
        const done = await pollSubscription(
          refreshSubscription,
          (row) => isActivePlan(row, targetPlan),
          () => !mountedRef.current,
        );
        if (done === null) return;
        setActivating(false);
        setNotice(
          done
            ? { tone: "success", text: `You're now on ${PLAN_LABELS[targetPlan]}.` }
            : { tone: "warn", text: "Your plan change was accepted but has not shown up yet. Refresh this page in a minute." },
        );
      }
    } catch (e) {
      setError(e?.message || "Unable to start checkout. Please try again.");
      // 409 means the page was out of date (e.g. a payment just failed). Re-read it.
      if (e?.status === 409) refreshSubscription({ silent: true });
    } finally {
      if (mountedRef.current) setUpgrading(false);
    }
  };

  const handleManage = async () => {
    setError("");
    setPortalLoading(true);
    try {
      await redirectToCustomerPortal();
    } catch (e) {
      setError(e?.message || "Unable to open billing portal. Please try again.");
    } finally {
      if (mountedRef.current) setPortalLoading(false);
    }
  };

  const isOwner = role === "owner";
  const paymentProblem = needsPayment(subscription);
  // A failing paid subscription still shows its plan (with a warning) rather
  // than "Free"; the derived `plan` is 'free' for any non-active status.
  const shownPlan = paymentProblem ? paidPlanOf(subscription) : plan;
  const badge = statusBadge(subscription);
  const busy = upgrading || activating;

  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const manageButton = (label) => (
    <button
      onClick={handleManage}
      disabled={portalLoading}
      className="border border-gray-600 text-heading text-sm px-5 py-2 rounded-lg hover:border-gray-400 transition-colors disabled:opacity-50"
    >
      {portalLoading ? "Opening…" : label}
    </button>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-heading mb-1">Billing & Plan</h1>
      <p className="text-gray-400 text-sm mb-8">
        Manage your subscription and billing details.
      </p>

      {notice && (
        <div
          role="status"
          className={`text-sm border rounded-lg px-3 py-2 mb-6 ${NOTICE_STYLES[notice.tone] ?? NOTICE_STYLES.info}`}
        >
          {notice.text}
        </div>
      )}

      {loadingSubscription ? (
        <div className="text-gray-400 text-sm">Loading…</div>
      ) : (
        <>
          {/* Current plan card */}
          <div className="bg-surface border border-gray-700 rounded-xl p-6 mb-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                  Current plan
                </div>
                <div className="text-2xl font-bold text-heading">
                  {PLAN_LABELS[shownPlan] ?? "Free"}
                </div>
                <div className="text-gray-400 text-sm mt-0.5">
                  {PLAN_PRICES[shownPlan] ?? "$0"}
                </div>
              </div>

              {badge && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${BADGE_STYLES[badge.tone]}`}>
                  {badge.label}
                </span>
              )}
            </div>

            {paymentProblem && (
              <div
                role="alert"
                className="text-sm text-yellow-400 bg-yellow-900/20 border border-yellow-900/40 rounded-lg px-3 py-2 mb-4"
              >
                Your last payment failed. Update your payment method to keep{" "}
                {PLAN_LABELS[shownPlan]}.
              </div>
            )}

            {subscription?.cancel_at_period_end && periodEnd && (
              <div className="text-sm text-yellow-400 bg-yellow-900/20 border border-yellow-900/40 rounded-lg px-3 py-2 mb-4">
                Your plan will cancel on {periodEnd}. You can renew it under Manage subscription.
              </div>
            )}

            {periodEnd && !subscription?.cancel_at_period_end && !paymentProblem && plan !== "free" && (
              <p className="text-xs text-gray-500 mb-4">
                Next billing date: {periodEnd}
              </p>
            )}

            {/* Actions — server enforces owner-only too */}
            {isOwner ? (
              <div className="flex flex-col sm:flex-row gap-3 mt-2">
                {paymentProblem && (
                  <button
                    onClick={handleManage}
                    disabled={portalLoading}
                    className="bg-accent text-black font-semibold text-sm px-5 py-2 rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
                  >
                    {portalLoading ? "Opening…" : "Update payment method"}
                  </button>
                )}

                {!paymentProblem && plan === "free" && (
                  <>
                    <button
                      onClick={() => handlePlan("pro")}
                      disabled={busy}
                      className="bg-accent text-black font-semibold text-sm px-5 py-2 rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
                    >
                      {upgrading ? "Redirecting…" : "Upgrade to Pro — $39/mo"}
                    </button>
                    {hasBillingHistory(subscription) && manageButton("Billing history")}
                  </>
                )}

                {!paymentProblem && plan === "pro" && (
                  <>
                    {manageButton("Manage subscription")}
                    <button
                      onClick={() => handlePlan("team")}
                      disabled={busy}
                      className="border border-accent text-accent text-sm px-5 py-2 rounded-lg hover:bg-accent/10 transition-colors disabled:opacity-50"
                    >
                      {upgrading ? "Switching…" : "Upgrade to Team"}
                    </button>
                  </>
                )}

                {!paymentProblem && plan === "team" && manageButton("Manage subscription")}
              </div>
            ) : (
              <p className="text-sm text-gray-500 mt-2">
                Only the organization owner can change the plan or billing details.
              </p>
            )}

            {isOwner && !paymentProblem && plan === "free" && (
              <p className="text-xs text-gray-500 mt-3">
                Paid plans start with a 14-day free trial for organizations that have never
                subscribed. A card is required to start, and you're charged when the trial
                ends unless you cancel before then.
              </p>
            )}
          </div>

          {error && (
            <p role="alert" className="text-red-400 text-sm mb-4">{error}</p>
          )}

          {/* Compare plans link */}
          <p className="text-sm text-gray-500">
            Want to compare plans?{" "}
            <Link to="/pricing" className="text-accent hover:underline">
              View pricing
            </Link>
          </p>
        </>
      )}
      {confirmDialog}
    </div>
  );
};

export default BillingPage;
