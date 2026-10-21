import { Link, useNavigate } from "react-router-dom";
import useUser from "@/context/useUser";
import { redirectToCheckout } from "@/lib/stripe";
import { paidPlanOf } from "@/lib/billingStatus";
import { toast } from "@/lib/toast";

// Monthly prices only. Annual billing is hidden until annual Stripe prices
// exist (audit M2 / WP07 Decision 1): the old toggle advertised $32/$74 per
// month billed yearly but checkout always charged the monthly price.
const plans = [
  {
    key: "free",
    name: "Free",
    monthly: { display: "$0", period: "forever" },
    description: "Get started and see if GripTrack fits your workflow.",
    cta: "Get started free",
    ctaStyle: "border border-gray-700 text-white hover:border-gray-500",
    features: [
      "Up to 50 equipment items",
      "1 active location",
      "Basic inventory management",
      "CSV export",
      "1 user (owner only)",
    ],
    missing: [
      "PDF import",
      "Audit log",
      "Staff invites",
      "Unlimited locations",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    monthly: { display: "$39",  period: "per month" },
    description: "For active productions that need full team access.",
    cta: "Upgrade to Pro",
    ctaStyle: "bg-accent text-black font-bold hover:bg-accent/90",
    badge: "Most popular",
    features: [
      "Unlimited equipment items",
      "Unlimited locations",
      "PDF import from rental houses",
      "Full audit log",
      "Up to 5 staff members",
      "CSV & PDF export",
      "Priority support",
    ],
    missing: [],
  },
  {
    key: "team",
    name: "Team",
    monthly: { display: "$89",  period: "per month" },
    description: "For larger crews and multi-production companies.",
    cta: "Upgrade to Team",
    ctaStyle: "border border-accent text-accent hover:bg-accent/10",
    features: [
      "Everything in Pro",
      "Unlimited staff members",
      "Multiple org support (coming soon)",
      "Advanced reporting (coming soon)",
      "Dedicated support",
    ],
    missing: [],
  },
];

const Check = () => (
  <svg className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
  </svg>
);

const X = () => (
  <svg className="w-4 h-4 text-gray-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const PricingPage = () => {
  const { authUser, plan: currentPlan, subscription } = useUser();
  const navigate = useNavigate();
  // A failing (past_due) Pro org still "is" Pro here; the derived plan says free.
  const accountPlan = paidPlanOf(subscription) ?? currentPlan;

  const handleCta = async (planKey) => {
    if (planKey === "free") {
      navigate(authUser ? "/" : "/auth?mode=signup");
      return;
    }

    if (!authUser) {
      navigate("/auth?mode=signup");
      return;
    }

    // Orgs that already pay (or whose payment is failing) change plans from
    // /billing, which confirms the switch and handles payment problems.
    // Never start a second Checkout from here.
    if (paidPlanOf(subscription)) {
      navigate("/billing");
      return;
    }

    try {
      await redirectToCheckout(planKey);
    } catch (e) {
      console.error("Checkout error", e);
      toast.error(e?.message || "Unable to start checkout. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-background text-white">
      {/* Nav */}
      <header className="border-b border-gray-800 sticky top-0 z-50 bg-background/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold text-accent">
            GripTrack
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            {authUser ? (
              <Link
                to="/"
                className="text-sm bg-accent text-black font-semibold px-4 py-2 rounded-lg hover:bg-accent/90 transition-colors"
              >
                Go to app
              </Link>
            ) : (
              <>
                <Link to="/auth" className="text-sm text-gray-400 hover:text-white transition-colors px-2 py-1">
                  Sign in
                </Link>
                <Link
                  to="/auth?mode=signup"
                  className="text-sm bg-accent text-black font-semibold px-4 py-2 rounded-lg hover:bg-accent/90 transition-colors"
                >
                  Get started free
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Header */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-16 pb-12 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold mb-4">
          Simple, transparent pricing
        </h1>
        <p className="text-gray-400 text-lg max-w-xl mx-auto">
          Start free and upgrade as your crew grows. No hidden fees, no surprises.
        </p>
      </section>

      {/* Plans */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
        <div className="grid sm:grid-cols-3 gap-6 items-start">
          {plans.map((p) => {
            const isCurrentPlan = authUser && accountPlan === p.key;
            const pricing = p.monthly;

            return (
              <div
                key={p.key}
                className={`relative rounded-2xl p-6 border flex flex-col ${
                  p.key === "pro"
                    ? "border-accent/50 bg-accent/5"
                    : "border-gray-800 bg-surface"
                }`}
              >
                {p.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-black text-xs font-bold px-3 py-1 rounded-full">
                    {p.badge}
                  </div>
                )}

                {isCurrentPlan && (
                  <div className="absolute -top-3 right-4 bg-gray-700 text-gray-200 text-xs font-semibold px-3 py-1 rounded-full">
                    Current plan
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-lg font-bold text-white mb-1">{p.name}</h3>

                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-4xl font-bold text-white">{pricing.display}</span>
                    <span className="text-gray-500 text-sm">/{pricing.period}</span>
                  </div>

                  <p className="text-gray-400 text-sm">{p.description}</p>
                </div>

                <button
                  onClick={() => handleCta(p.key)}
                  disabled={isCurrentPlan}
                  className={`w-full py-2.5 rounded-lg text-sm transition-colors mb-6 ${
                    isCurrentPlan
                      ? "bg-gray-800 text-gray-500 cursor-default"
                      : p.ctaStyle
                  }`}
                >
                  {isCurrentPlan ? "Current plan" : p.cta}
                </button>

                <ul className="flex flex-col gap-2.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check />
                      <span className="text-gray-300">{f}</span>
                    </li>
                  ))}
                  {p.missing.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <X />
                      <span className="text-gray-600">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <p data-testid="trial-terms" className="text-center text-gray-600 text-sm mt-10">
          Pro and Team start with a 14-day free trial the first time your organization subscribes.
          A card is required to start the trial, and it is charged automatically when the trial
          ends unless you cancel before then.
        </p>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-600">
        <Link to="/" className="font-semibold text-accent">GripTrack</Link>
        <span>© {new Date().getFullYear()} GripTrack. All rights reserved.</span>
        <Link to="/auth" className="hover:text-gray-400 transition-colors">Sign in</Link>
      </footer>
    </div>
  );
};

export default PricingPage;
