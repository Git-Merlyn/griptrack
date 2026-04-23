import { Link } from "react-router-dom";

const features = [
  {
    icon: "📦",
    title: "Real-time inventory tracking",
    description:
      "Track every piece of gear by name, category, quantity, and status. Know exactly what you have and where it is at all times.",
  },
  {
    icon: "🚛",
    title: "Multi-location support",
    description:
      "Organize equipment across trucks, stages, and storage. Move items between locations and automatically merge duplicates.",
  },
  {
    icon: "📄",
    title: "Rental PDF import",
    description:
      "Upload a rental house PDF and GripTrack parses it directly into your inventory — no manual entry required.",
  },
  {
    icon: "👥",
    title: "Team management",
    description:
      "Invite your crew, assign roles, and control who can view or edit. Everyone stays in sync from prep through wrap.",
  },
];

const steps = [
  {
    number: "01",
    title: "Create your organization",
    description: "Sign up and set up your company in under a minute.",
  },
  {
    number: "02",
    title: "Add your inventory",
    description: "Import from a rental PDF or add items manually. Organize by location right away.",
  },
  {
    number: "03",
    title: "Track on set",
    description: "Move gear, update statuses, and keep your whole team on the same page — from any device.",
  },
];

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-background text-white">
      {/* Nav */}
      <header className="border-b border-gray-800 sticky top-0 z-50 bg-background/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <span className="text-xl font-bold text-accent">GripTrack</span>

          <nav className="flex items-center gap-2 sm:gap-4">
            <Link
              to="/pricing"
              className="hidden sm:block text-sm text-gray-400 hover:text-white transition-colors px-2 py-1"
            >
              Pricing
            </Link>
            <Link
              to="/auth"
              className="hidden sm:block text-sm text-gray-400 hover:text-white transition-colors px-2 py-1"
            >
              Sign in
            </Link>
            <Link
              to="/auth?mode=signup"
              className="text-sm bg-accent text-black font-semibold px-3 py-2 sm:px-4 rounded-lg hover:bg-accent/90 transition-colors whitespace-nowrap"
            >
              <span className="sm:hidden">Get started</span>
              <span className="hidden sm:inline">Get started free</span>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-24 text-center">
        <div className="inline-block bg-accent/10 text-accent text-xs font-semibold px-3 py-1 rounded-full mb-6 border border-accent/20">
          Built for grip &amp; electric departments
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold leading-tight mb-6 text-white">
          Inventory management that keeps up{" "}
          <span className="text-accent">with your shoot</span>
        </h1>

        <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10">
          GripTrack helps grip and electric departments track gear, manage
          locations, and stay organized — from prep to wrap. No spreadsheets
          required.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/auth?mode=signup"
            className="bg-accent text-black font-semibold px-8 py-3 rounded-lg hover:bg-accent/90 transition-colors text-base"
          >
            Start for free
          </Link>
          <Link
            to="/pricing"
            className="bg-surface border border-gray-700 text-white font-semibold px-8 py-3 rounded-lg hover:border-gray-500 transition-colors text-base"
          >
            See pricing
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="bg-surface border-y border-gray-800 py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl font-bold text-center mb-4">
            Everything your department needs
          </h2>
          <p className="text-gray-400 text-center mb-14 max-w-xl mx-auto">
            Purpose-built for the pace of a film set — not a generic inventory
            tool retrofitted for production.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-background rounded-xl p-6 border border-gray-800 hover:border-accent/30 transition-colors"
              >
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-4">How it works</h2>
        <p className="text-gray-400 text-center mb-14 max-w-xl mx-auto">
          Up and running in minutes, not days.
        </p>

        <div className="grid sm:grid-cols-3 gap-8">
          {steps.map((s) => (
            <div key={s.number} className="text-center">
              <div className="text-5xl font-bold text-accent/20 mb-4">
                {s.number}
              </div>
              <h3 className="font-semibold text-white text-lg mb-2">
                {s.title}
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                {s.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing CTA banner */}
      <section className="bg-accent/5 border-y border-accent/20 py-16">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            Start free, upgrade when you're ready
          </h2>
          <p className="text-gray-400 mb-8">
            The free plan gets you up and running. Upgrade for unlimited items,
            PDF import, and full team access.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/auth?mode=signup"
              className="bg-accent text-black font-semibold px-8 py-3 rounded-lg hover:bg-accent/90 transition-colors"
            >
              Get started free
            </Link>
            <Link
              to="/pricing"
              className="border border-gray-700 text-white font-semibold px-8 py-3 rounded-lg hover:border-gray-500 transition-colors"
            >
              View pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-600">
        <span className="font-semibold text-accent">GripTrack</span>
        <span>© {new Date().getFullYear()} GripTrack. All rights reserved.</span>
        <div className="flex gap-4">
          <Link to="/pricing" className="hover:text-gray-400 transition-colors">
            Pricing
          </Link>
          <Link to="/auth" className="hover:text-gray-400 transition-colors">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
