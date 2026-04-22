// src/components/TrialBanner.jsx
// Displays a full-width trial status banner when a trial is active or expired.
// – Active trial with > 7 days left : no banner (sidebar indicator is enough)
// – Active trial with ≤ 7 days left : yellow/amber warning
// – Trial expired (free plan, no paid sub): red alert

import { useState } from "react";
import { Link } from "react-router-dom";
import useTrial from "@/hooks/useTrial";
import useUser from "@/context/useUser";

const SESSION_DISMISS_KEY = "gt_trial_banner_dismissed";

const TrialBanner = () => {
  const { role } = useUser();
  const { isTrialActive, isTrialExpired, daysLeft } = useTrial();

  // Allow owners to dismiss the warning-level banner for the current session.
  // The expired banner is never dismissible — it needs action.
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  const isOwner = role === "owner";

  const dismiss = () => {
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    setDismissed(true);
  };

  // Expired banner — always shown to owner, no dismiss
  if (isTrialExpired) {
    return (
      <div className="bg-danger/10 border-b border-danger/30 px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm text-danger font-medium">
          Your free trial has ended. Upgrade to keep full access.
        </span>
        {isOwner && (
          <Link
            to="/billing"
            className="shrink-0 text-xs font-semibold bg-danger text-white px-3 py-1 rounded-lg hover:bg-danger/80 transition-colors"
          >
            Upgrade now
          </Link>
        )}
      </div>
    );
  }

  // Warning banner — shown when ≤ 7 days remain and not dismissed
  if (isTrialActive && daysLeft !== null && daysLeft <= 7 && !dismissed) {
    const dayLabel = daysLeft === 1 ? "1 day" : `${daysLeft} days`;

    return (
      <div className="bg-warning/10 border-b border-warning/30 px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm text-warning font-medium">
          Your free trial ends in {dayLabel}.
          {isOwner ? " Upgrade to keep PDF import, audit logs, and staff invites." : ""}
        </span>

        <div className="flex items-center gap-3 shrink-0">
          {isOwner && (
            <Link
              to="/billing"
              className="text-xs font-semibold bg-warning text-black px-3 py-1 rounded-lg hover:bg-warning/80 transition-colors"
            >
              Upgrade
            </Link>
          )}
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
  }

  return null;
};

export default TrialBanner;
