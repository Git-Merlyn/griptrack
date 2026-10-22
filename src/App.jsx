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
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import LandingPage from "./pages/LandingPage";

// Lazy-loaded: secondary routes, only fetched when navigated to
const Staff           = lazy(() => import("./pages/Staff"));
const NotFound        = lazy(() => import("./pages/NotFound"));
const CompleteProfile = lazy(() => import("./pages/CompleteProfile"));
const OrgSetup        = lazy(() => import("./pages/OrgSetup"));
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

const App = () => {
  const location = useLocation();
  // needsOrgSetup / needsProfileSetup update in place after OrgSetup /
  // CompleteProfile save (UserProvider.applyOrgName / applyProfile).
  const {
    authUser,
    loadingOrg,
    needsOrgSetup,
    needsProfileSetup,
    features,
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
            <Route path="*" element={<Navigate to="/auth" replace />} />
          </Routes>
        </Suspense>
      ) : (
        // Authenticated
        <>
          <GhostBar />
          {needsOrgSetup &&
          location.pathname !== "/org-setup" &&
          location.pathname !== "/invite-accept" ? (
            <Navigate to="/org-setup" replace />
          ) : !needsOrgSetup &&
            needsProfileSetup &&
            location.pathname !== "/complete-profile" &&
            location.pathname !== "/invite-accept" ? (
            <Navigate to="/complete-profile" replace />
          ) : null}

          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Redirect auth pages to app */}
              <Route path="/auth" element={<Navigate to="/" replace />} />
              <Route path="/invite" element={<Navigate to="/" replace />} />

              {/* Password reset — recovery session exists before password is set */}
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Public pages remain accessible when logged in */}
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/terms" element={<TermsPage />} />

              {/* Onboarding */}
              <Route path="/org-setup" element={<OrgSetup />} />
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
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </>
      )}
    </>
  );
};

export default App;
