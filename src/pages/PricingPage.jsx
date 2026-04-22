import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useUser from "@/context/useUser";
import { redirectToCheckout } from "@/lib/stripe";

// Pricing per billing cycle.
// annualMonthly = displayed monthly equivalent when billed annually.
// annualTotal   = actual charge per year.
// annualSaving  = amount saved vs paying monthly for 12 months.
const plans = [
  {
    key: "free",
    name: "Free",
    monthly: { display: "$0", period: "forever" },
    annual:  { display: "$0", period: "forever" },
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
    annual:  { display: "$32",  period: "per month", billed: "$384/yr", saving: "$84" },
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
    annual:  { display: "$74",  period: "per month", billed: "$888/yr", saving: "$180" },
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

/** Monthly / Annual pill toggle */
const BillingToggle = ({ billing, onChange }) => (
  <div className="flex items-center justify-center gap-3 mt-8">
    <span
      className={`text-sm font-medium transition-colors ${
        billing === "monthly" ? "text-white" : "text-gray-500"
      }`}
    >
      Monthly
    </span>

    <button
      type="button"
      role="switch"
      aria-checked={billing === "annual"}
      onClick={() => onChange(billing === "monthly" ? "annual" : "monthly")}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        billing === "annual" ? "bg-accent" : "bg-gray-700"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          billing === "annual" ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>

    <span
      className={`text-sm font-medium transition-colors ${
        billing === "annual" ? "text-white" : "text-gray-500"
      }`}
    >
      Annual
    </span>

    {/* "2 months free" badge — only visible when annual is not yet selected */}
    <span
      className={`text-xs font-semibold px-2 py-0.5 rounded-full transition-opacity ${
        billing === "annual"
          ? "bg-accent/20 text-accent opacity-100"
          : "bg-gray-800 text-gray-400 opacity-100"
      }`}
    >
      {billing === "annual" ? "2 months free ✓" : "Save 2 months"}
    </span>
  </div>
);

const PricingPage = () => {
  const { authUser, plan: currentPlan } = useUser();
  const navigate = useNavigate();
  const [billing, setBilling] = useState("monthly");

  const handleCta = async (planKey) => {
    if (planKey === "free") {
      navigate(authUser ? "/" : "/auth?mode=signup");
      return;
    }

    if (!authUser) {
      navigate("/auth?mode=signup");
      return;
    }

    // Pass billing cycle to checkout so the correct Stripe price is used.
    // redirectToCheckout should accept an optional second argument when
    // annual Stripe price IDs are configured.
    try {
      await redirectToCheckout(planKey, billing);
    } catch (e) {
      console.error("Checkout error", e);
      alert("Unable to start checkout. Please try again.");
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

      {/* Header + billing toggle */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-16 pb-12 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold mb-4">
          Simple, transparent pricing
        </h1>
        <p className="text-gray-400 text-lg max-w-xl mx-auto">
          Start free and upgrade as your crew grows. No hidden fees, no surprises.
        </p>

        <BillingToggle billing={billing} onChange={setBilling} />
      </section>

      {/* Plans */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
        <div className="grid sm:grid-cols-3 gap-6 items-start">
          {plans.map((p) => {
            const isCurrentPlan = authUser && currentPlan === p.key;
            const pricing = billing === "annual" ? p.annual : p.monthly;

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

                  {/* Annual sub-line: "Billed $384/yr · Save $84" */}
                  {billing === "annual" && pricing.billed && (
                    <p className="text-xs text-gray-500 mb-2">
                      Billed {pricing.billed}
                      <span className="ml-2 text-accent font-medium">
                        Save {pricing.saving}
                      </span>
                    </p>
                  )}

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

        <p className="text-center text-gray-600 text-sm mt-10">
          All plans include a 14-day free trial of Pro features. No credit card required to start.
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
