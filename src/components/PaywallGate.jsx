import { Link } from "react-router-dom";
import useUser from "@/context/useUser";
import { planAllows } from "@/lib/plan";

const PLAN_LABELS = { pro: "Pro", team: "Team" };

/**
 * Wraps a paid feature. Renders children when the org's effective plan
 * (a pro/team subscription that is active, trialing or past_due) meets
 * `requiredPlan`; otherwise renders an upgrade prompt. Only the owner gets
 * the "View plans" link — other roles are told to ask the owner.
 *
 * Web only (the mobile apps show no upgrade prompts). The matching server
 * checks live in public.enforce_plan_limits() and parse-rental-pdf (audit M9).
 *
 * Usage:
 *   <PaywallGate requiredPlan="pro" featureName="Staff invites">
 *     <YourFeature />
 *   </PaywallGate>
 */
const PaywallGate = ({ requiredPlan = "pro", featureName, children }) => {
  const { effectivePlan, role, loadingSubscription } = useUser();

  if (loadingSubscription) return null;

  if (planAllows(effectivePlan, requiredPlan)) return children;

  const planLabel = PLAN_LABELS[requiredPlan] ?? requiredPlan;

  return (
    <div className="rounded-xl border border-accent/20 bg-accent/5 p-6 text-center">
      <div className="text-2xl mb-3" aria-hidden="true">🔒</div>
      <h3 className="font-semibold text-white mb-1">
        {featureName ? `${featureName} is a ${planLabel} feature` : `${planLabel} plan required`}
      </h3>
      {role === "owner" ? (
        <>
          <p className="text-sm text-gray-400 mb-4">
            Upgrade your plan to unlock this feature.
          </p>
          <Link
            to="/pricing"
            className="inline-block bg-accent text-black text-sm font-semibold px-5 py-2 rounded-lg hover:bg-accent/90 transition-colors"
          >
            View plans
          </Link>
        </>
      ) : (
        <p className="text-sm text-gray-400">
          Ask your organization&apos;s owner to upgrade to unlock this feature.
        </p>
      )}
    </div>
  );
};

export default PaywallGate;
