import { Link } from "react-router-dom";
import useUser from "@/context/useUser";

const PLAN_RANK = { free: 0, pro: 1, team: 2 };

/**
 * Wraps a premium feature. Shows an upgrade prompt if the user's
 * current plan doesn't meet the required plan.
 *
 * Usage:
 *   <PaywallGate requiredPlan="pro" featureName="PDF Import">
 *     <YourFeature />
 *   </PaywallGate>
 */
const PaywallGate = ({ requiredPlan = "pro", featureName, children }) => {
  const { plan, loadingSubscription } = useUser();

  if (loadingSubscription) return null;

  const hasAccess = PLAN_RANK[plan] >= PLAN_RANK[requiredPlan];
  if (hasAccess) return children;

  return (
    <div className="rounded-xl border border-accent/20 bg-accent/5 p-6 text-center">
      <div className="text-2xl mb-3">🔒</div>
      <h3 className="font-semibold text-white mb-1">
        {featureName ? `${featureName} is a ${requiredPlan} feature` : `${requiredPlan} plan required`}
      </h3>
      <p className="text-sm text-gray-400 mb-4">
        Upgrade your plan to unlock this feature.
      </p>
      <Link
        to="/pricing"
        className="inline-block bg-accent text-black text-sm font-semibold px-5 py-2 rounded-lg hover:bg-accent/90 transition-colors"
      >
        View plans
      </Link>
    </div>
  );
};

export default PaywallGate;
