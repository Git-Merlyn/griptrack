// src/App.jsx
import {
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { lazy, Suspense } from "react";

// Always-eager: these are entry points — every session hits one of them immediately
import MainLayout from "./components/layout/MainLayout";
import GhostBar from "./components/GhostBar";
import BootstrapErrorScreen from "./components/BootstrapErrorScreen";
import { safeRedirectPath } from "./lib/authRedirect";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import LandingPage from "./pages/LandingPage";

// Lazy-loaded: secondary routes, only fetched when navigated to
const Staff           = lazy(() => import("./pages/Staff"));
const NotFound        = lazy(() => import("./pages/NotFound"));
const CompleteProfile = lazy(() => import("./pages/CompleteProfile"));
const OrgSetup        = lazy(() => import("./pages/OrgSetup"));
const WaitingForInvite = lazy(() => import("./pages/WaitingForInvite"));
const InviteAccept    = lazy(() => import("./pages/InviteAccept"));
const PricingPage     = lazy(() => import("./pages/PricingPage"));
const BillingPage     = lazy(() => import("./pages/BillingPage"));
const LocationsPage   = lazy(() => import("./pages/LocationsPage"));
const RequestsPage    = lazy(() => import("./pages/requests/RequestsPage"));
const TeamsPage       = lazy(() => import("./pages/TeamsPage"));
const SettingsPage    = lazy(() => import("./pages/SettingsPage"));
const PrivacyPage     = lazy(() => import("./pages/legal/PrivacyPage"));
const TermsPage       = lazy(() => import("./pages/legal/TermsPage"));

import useUser from "./context/useUser";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

// Branded fallback shown while a lazy chunk loads
const PageLoader = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3">
    <span className="text-2xl font-bold text-accent">GripTrack</span>
    <span className="text-gray-500 text-sm animate-pulse">Loading…</span>
  </div>
);

// Unauthenticated hit on a protected path: remember where the user was going
// so the authenticated tree can send them back after sign-in (L27). Only the
// path and query are kept, never the hash (auth tokens live there).
const RedirectToAuth = () => {
  const location = useLocation();
  return (
    <Navigate
      to="/auth"
      replace
      state={{ from: `${location.pathname}${location.search}` }}
    />
  );
};

// Signed in while on /auth: go to the remembered deep link, or home (L27).
const RedirectAfterAuth = () => {
  const location = useLocation();
  return <Navigate to={safeRedirectPath(location.state?.from)} replace />;
};

// Paths the onboarding redirects must never bounce the user away from (L22):
// InviteAccept finishes its own onboarding, and a password-recovery session
// must reach the reset form before anything else.
const ONBOARDING_EXEMPT = new Set(["/invite-accept", "/reset-password"]);

// Pages a crew sign-up still waiting for an invite may open (WP25); every
// other authenticated path sends them to /waiting.
const WAITING_ALLOWED = new Set(["/waiting", "/pricing", "/privacy", "/terms"]);

const App = () => {
  const location = useLocation();
  // needsOrgSetup / needsProfileSetup update in place after OrgSetup /
  // CompleteProfile save (UserProvider.applyOrgName / applyProfile).
  const {
    authUser,
    loadingOrg,
    needsOrgSetup,
    needsProfileSetup,
    awaitingInvite,
    features,
    bootstrapError,
    rebootstrap,
    logout,
    isPlatformAdmin,
  } = useUser();

  return (
    <>
      <Analytics />
      <SpeedInsights />

      {loadingOrg ? (
        // Session/org still resolving. Rendering routes before we know whether
        // a session exists would let the unauthenticated "*" catch-all rewrite
        // deep links (e.g. a refresh on /staff) to /auth and bounce the user
        // back to the dashboard.
        <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3">
          <span className="text-2xl font-bold text-accent">GripTrack</span>
          <span className="text-gray-500 text-sm animate-pulse">Loading…</span>
        </div>
      ) : authUser && bootstrapError ? (
        // Signed in, but bootstrap_session failed (network or server error).
        // Never render the app with orgId null; offer a retry instead (L3).
        <BootstrapErrorScreen
          error={bootstrapError}
          onRetry={rebootstrap}
          onSignOut={logout}
        />
      ) : !authUser ? (
        // Unauthenticated: show public pages, redirect protected routes to /auth
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/auth" element={<Auth mode="normal" />} />
            <Route path="/invite" element={<Auth mode="invite" />} />
            <Route path="/invite-accept" element={<InviteAccept />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="*" element={<RedirectToAuth />} />
          </Routes>
        </Suspense>
      ) : (
        // Authenticated
        <>
          {/* Platform-admin tool; non-admins never mount it (L7) */}
          {isPlatformAdmin && <GhostBar />}
          {awaitingInvite ? (
            !WAITING_ALLOWED.has(location.pathname) &&
            !ONBOARDING_EXEMPT.has(location.pathname) ? (
              <Navigate to="/waiting" replace />
            ) : null
          ) : needsOrgSetup &&
          location.pathname !== "/org-setup" &&
          !ONBOARDING_EXEMPT.has(location.pathname) ? (
            <Navigate to="/org-setup" replace />
          ) : !needsOrgSetup &&
            needsProfileSetup &&
            location.pathname !== "/complete-profile" &&
            !ONBOARDING_EXEMPT.has(location.pathname) ? (
            <Navigate to="/complete-profile" replace />
          ) : null}

          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Redirect auth pages to app */}
              <Route path="/auth" element={<RedirectAfterAuth />} />
              <Route path="/invite" element={<Navigate to="/" replace />} />

              {/* Password reset — recovery session exists before password is set */}
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Public pages remain accessible when logged in */}
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/terms" element={<TermsPage />} />

              {/* Onboarding */}
              <Route path="/org-setup" element={<OrgSetup />} />
              <Route path="/waiting" element={<WaitingForInvite />} />
              <Route path="/complete-profile" element={<CompleteProfile />} />
              <Route path="/invite-accept" element={<InviteAccept />} />

              {/* Main app */}
              <Route path="/" element={<MainLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="staff" element={<Staff />} />
                <Route path="billing" element={<BillingPage />} />
                <Route path="locations" element={<LocationsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                {/* Feature-gated routes — redirect to home if disabled */}
                <Route
                  path="requests"
                  element={
                    features.requests_enabled
                      ? <RequestsPage />
                      : <Navigate to="/" replace />
                  }
                />
                <Route
                  path="teams"
                  element={
                    features.teams_enabled
                      ? <TeamsPage />
                      : <Navigate to="/" replace />
                  }
                />
                {/* Unknown authenticated paths: 404 inside the app shell (L29) */}
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </Suspense>
        </>
      )}
    </>
  );
};

export default App;
