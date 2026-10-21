// src/components/TrialBanner.jsx
// Owner-only banner for a Stripe trial (subscription status 'trialing')
// with 7 or fewer days left. Dismissible for the browser session.
// – Crew, department heads and admins never see it: only the owner can act on billing.
// – There is no "trial expired" banner: there is no org-level trial (audit M9,
//   WP09 Option A), and a Stripe trial converts to paid (or cancels) on its own.

import { useState } from "react";
import { Link } from "react-router-dom";
import useTrial from "@/hooks/useTrial";
import useUser from "@/context/useUser";

const SESSION_DISMISS_KEY = "gt_trial_banner_dismissed";

const PLAN_LABELS = { pro: "Pro", team: "Team" };

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric" });

const TrialBanner = () => {
  const { role, plan } = useUser();
  const { isTrialActive, daysLeft, trialEndDate, willCancel } = useTrial();

  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  const dismiss = () => {
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    setDismissed(true);
  };

  if (role !== "owner") return null;
  if (!isTrialActive || daysLeft === null || daysLeft > 7 || dismissed) return null;

  const dayLabel = daysLeft === 1 ? "1 day" : `${daysLeft} days`;
  const planLabel = PLAN_LABELS[plan] ?? "Pro";
  const message = willCancel
    ? `Your ${planLabel} trial ends in ${dayLabel} and won't renew.`
    : `Your ${planLabel} trial ends in ${dayLabel}. Your card will be charged on ${formatDate(trialEndDate)} unless you cancel.`;

  return (
    <div className="bg-warning/10 border-b border-warning/30 px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
      <span className="text-sm text-warning font-medium">{message}</span>

      <div className="flex items-center gap-3 shrink-0">
        <Link
          to="/billing"
          className="text-xs font-semibold bg-warning text-black px-3 py-1 rounded-lg hover:bg-warning/80 transition-colors"
        >
          Manage billing
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss trial banner"
          className="text-warning/60 hover:text-warning text-xs transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default TrialBanner;
