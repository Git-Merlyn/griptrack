// src/hooks/useTrial.js
// Derives the organization's trial state from subscription data and the
// org-level trial_ends_at date set at sign-up.
//
// Priority:
//   1. If subscription.status === 'trialing' → Stripe-managed trial
//      (ends at subscription.current_period_end)
//   2. Else if plan === 'free' and trialEndsAt is in the future → org trial
//   3. Otherwise → no trial UI shown

import { useMemo } from "react";
import useUser from "@/context/useUser";

/**
 * Returns how many whole days remain until `dateStr`.
 * Negative values mean the date is in the past.
 * Returns null if dateStr is falsy or unparseable.
 */
function daysUntil(dateStr) {
  if (!dateStr) return null;
  try {
    const end = new Date(dateStr);
    const diffMs = end.getTime() - Date.now();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

/**
 * @returns {{
 *   isTrialActive: boolean,   // trial is running and not expired
 *   isTrialExpired: boolean,  // trial window has closed and org is on free plan
 *   daysLeft: number|null,    // whole days remaining (may be ≤ 0 when expired)
 *   trialEndDate: string|null,// ISO string of trial end
 *   isStripeTrial: boolean,   // true when driven by Stripe 'trialing' status
 * }}
 */
const useTrial = () => {
  const { plan, subscription, trialEndsAt } = useUser();

  return useMemo(() => {
    const noop = {
      isTrialActive: false,
      isTrialExpired: false,
      daysLeft: null,
      trialEndDate: null,
      isStripeTrial: false,
    };

    // Orgs on a paid active plan have no trial UI.
    // (plan === 'pro' | 'team' with status 'active' → they've already converted)
    if (plan !== "free" && subscription?.status === "active") return noop;

    // 1. Stripe-managed trial
    if (subscription?.status === "trialing" && subscription?.current_period_end) {
      const days = daysUntil(subscription.current_period_end);
      return {
        isTrialActive: days !== null && days > 0,
        isTrialExpired: false, // Stripe handles expiry automatically
        daysLeft: days,
        trialEndDate: subscription.current_period_end,
        isStripeTrial: true,
      };
    }

    // 2. Org-level trial (plan === 'free', using trial_ends_at from organizations)
    if (plan === "free" && trialEndsAt) {
      const days = daysUntil(trialEndsAt);
      if (days === null) return noop;

      return {
        isTrialActive: days > 0,
        isTrialExpired: days <= 0,
        daysLeft: days,
        trialEndDate: trialEndsAt,
        isStripeTrial: false,
      };
    }

    return noop;
  }, [plan, subscription, trialEndsAt]);
};

export default useTrial;
