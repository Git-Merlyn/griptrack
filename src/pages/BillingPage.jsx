import { useState } from "react";
import { Link } from "react-router-dom";
import useUser from "@/context/useUser";
import { redirectToCheckout, redirectToCustomerPortal } from "@/lib/stripe";

const PLAN_LABELS = {
  free: "Free",
  pro: "Pro",
  team: "Team",
};

const PLAN_PRICES = {
  free: "$0",
  pro: "$39/month",
  team: "$89/month",
};

const BillingPage = () => {
  const { plan, subscription, loadingSubscription } = useUser();
  const [upgrading, setUpgrading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState("");

  const handleUpgrade = async (targetPlan) => {
    setError("");
    setUpgrading(true);
    try {
      await redirectToCheckout(targetPlan);
    } catch {
      setError("Unable to start checkout. Please try again.");
    } finally {
      setUpgrading(false);
    }
  };

  const handleManage = async () => {
    setError("");
    setPortalLoading(true);
    try {
      await redirectToCustomerPortal();
    } catch {
      setError("Unable to open billing portal. Please try again.");
    } finally {
      setPortalLoading(false);
    }
  };

  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-1">Billing & Plan</h1>
      <p className="text-gray-400 text-sm mb-8">
        Manage your subscription and billing details.
      </p>

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
                <div className="text-2xl font-bold text-white">
                  {PLAN_LABELS[plan] ?? "Free"}
                </div>
                <div className="text-gray-400 text-sm mt-0.5">
                  {PLAN_PRICES[plan] ?? "$0"}
                </div>
              </div>

              {subscription?.status && (
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    subscription.status === "active" || subscription.status === "trialing"
                      ? "bg-green-900/50 text-green-400"
                      : subscription.status === "past_due"
                      ? "bg-yellow-900/50 text-yellow-400"
                      : "bg-gray-800 text-gray-400"
                  }`}
                >
                  {subscription.status === "trialing" ? "Trial" : subscription.status}
                </span>
              )}
            </div>

            {subscription?.cancel_at_period_end && periodEnd && (
              <div className="text-sm text-yellow-400 bg-yellow-900/20 border border-yellow-900/40 rounded-lg px-3 py-2 mb-4">
                Your plan will cancel on {periodEnd}. You can renew it below.
              </div>
            )}

            {periodEnd && !subscription?.cancel_at_period_end && (
              <p className="text-xs text-gray-500 mb-4">
                Next billing date: {periodEnd}
              </p>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 mt-2">
              {plan === "free" && (
                <button
                  onClick={() => handleUpgrade("pro")}
                  disabled={upgrading}
                  className="bg-accent text-black font-semibold text-sm px-5 py-2 rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
                >
                  {upgrading ? "Redirecting…" : "Upgrade to Pro — $39/mo"}
                </button>
              )}

              {plan === "pro" && (
                <>
                  <button
                    onClick={handleManage}
                    disabled={portalLoading}
                    className="border border-gray-600 text-white text-sm px-5 py-2 rounded-lg hover:border-gray-400 transition-colors disabled:opacity-50"
                  >
                    {portalLoading ? "Opening…" : "Manage subscription"}
                  </button>
                  <button
                    onClick={() => handleUpgrade("team")}
                    disabled={upgrading}
                    className="border border-accent text-accent text-sm px-5 py-2 rounded-lg hover:bg-accent/10 transition-colors disabled:opacity-50"
                  >
                    {upgrading ? "Redirecting…" : "Upgrade to Team"}
                  </button>
                </>
              )}

              {plan === "team" && (
                <button
                  onClick={handleManage}
                  disabled={portalLoading}
                  className="border border-gray-600 text-white text-sm px-5 py-2 rounded-lg hover:border-gray-400 transition-colors disabled:opacity-50"
                >
                  {portalLoading ? "Opening…" : "Manage subscription"}
                </button>
              )}
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-sm mb-4">{error}</p>
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
    </div>
  );
};

export default BillingPage;
