// src/hooks/useTrial.js
// Derives the organization's trial state from the Stripe subscription row.
//
// The only trial is Stripe's: the owner starts it at Checkout (card
// required, 14 days, offered only to orgs that never subscribed) and Stripe
// charges the card when it ends unless the owner cancels. The org-level
// organizations.trial_ends_at date is NOT a trial and grants nothing
// (audit M9, WP09 Option A), so there is no countdown and no "trial has
// ended" state for it.

import { useMemo } from "react";
import useUser from "@/context/useUser";

/**
 * Returns how many whole days remain until `dateStr`.
 * Negative values mean the date is in the past.
 * Returns null if dateStr is falsy or unparseable.
 */
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const end = new Date(dateStr);
  if (isNaN(end.getTime())) return null;
  return Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

/**
 * @returns {{
 *   isTrialActive: boolean,    // Stripe trial running (status 'trialing', end in the future)
 *   daysLeft: number|null,     // whole days remaining (may be <= 0 once the end has passed)
 *   trialEndDate: string|null, // ISO string of the trial end
 *   isStripeTrial: boolean,    // true whenever the subscription is 'trialing'
 *   willCancel: boolean,       // owner cancelled during the trial: it will not convert
 * }}
 */
const useTrial = () => {
  const { subscription } = useUser();

  return useMemo(() => {
    const noop = {
      isTrialActive: false,
      daysLeft: null,
      trialEndDate: null,
      isStripeTrial: false,
      willCancel: false,
    };

    if (subscription?.status !== "trialing") return noop;

    const days = daysUntil(subscription.current_period_end);
    if (days === null) return noop;

    return {
      isTrialActive: days > 0,
      daysLeft: days,
      trialEndDate: subscription.current_period_end,
      isStripeTrial: true,
      willCancel: !!subscription.cancel_at_period_end,
    };
  }, [subscription]);
};

export default useTrial;
