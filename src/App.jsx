// src/App.jsx
import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import Dashboard from "./pages/Dashboard";
import Staff from "./pages/Staff";
import NotFound from "./pages/NotFound";
import MainLayout from "./components/layout/MainLayout";
import Auth from "./pages/Auth";
import CompleteProfile from "./pages/CompleteProfile";
import InviteAccept from "./pages/InviteAccept";
import LandingPage from "./pages/LandingPage";
import PricingPage from "./pages/PricingPage";
import ResetPassword from "./pages/ResetPassword";
import BillingPage from "./pages/BillingPage";
import LocationsPage from "./pages/LocationsPage";
import RequestsPage from "./pages/requests/RequestsPage";
import useUser from "./context/useUser";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

const OrgSetup = ({ orgId, initialName, onSaved }) => {
  const navigate = useNavigate();
  const [name, setName] = useState(initialName || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setName(initialName || "");
  }, [initialName]);

  const save = async (e) => {
    e.preventDefault();
    setErr("");

    const trimmed = String(name || "").trim();
    if (!trimmed) {
      setErr("Company name is required.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ name: trimmed })
        .eq("id", orgId);

      if (error) throw error;

      if (typeof onSaved === "function") onSaved(trimmed);
      navigate("/", { replace: true });
    } catch (e2) {
      setErr(e2?.message || "Failed to save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="bg-surface rounded-2xl p-6 w-[92%] max-w-md shadow-lg">
        <h1 className="text-2xl font-bold text-accent mb-1">
          Organization setup
        </h1>
        <p className="text-gray-300 mb-6">Set your company name to continue.</p>

        <form onSubmit={save} className="flex flex-col gap-3">
          <div>
            <label className="text-sm text-gray-300">Company name</label>
            <input
              className="w-full mt-1 px-3 py-2 rounded bg-white text-black"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Polaris Grip"
              autoFocus
            />
          </div>

          {err ? <div className="text-red-400 text-sm">{err}</div> : null}

          <button
            type="submit"
            disabled={busy || !orgId}
            className={busy || !orgId ? "btn-disabled" : "btn-accent"}
          >
            {busy ? "Saving…" : "Save & Continue"}
          </button>
        </form>
      </div>
    </div>
  );
};

const App = () => {
  const location = useLocation();
  const {
    authUser,
    loadingOrg,
    orgId,
    orgName,
    needsOrgSetup,
    needsProfileSetup,
  } = useUser();

  const [orgNameLocal, setOrgNameLocal] = useState(null);
  const effectiveOrgName = orgNameLocal ?? orgName;
  const effectiveNeedsOrgSetup = orgNameLocal ? false : needsOrgSetup;

  const [profileCompletedLocal, setProfileCompletedLocal] = useState(false);
  const effectiveNeedsProfileSetup = profileCompletedLocal
    ? false
    : needsProfileSetup;

  return (
    <>
      <Analytics />
      <SpeedInsights />

      {!authUser ? (
        // Unauthenticated: show public pages, redirect protected routes to /auth
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/auth" element={<Auth mode="normal" />} />
          <Route path="/invite" element={<Auth mode="invite" />} />
          <Route path="/invite-accept" element={<InviteAccept />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="*" element={<Navigate to="/auth" replace />} />
        </Routes>
      ) : loadingOrg ? (
        <div className="min-h-screen flex items-center justify-center bg-black text-gray-200">
          Loading…
        </div>
      ) : (
        // Authenticated
        <>
          {effectiveNeedsOrgSetup &&
          location.pathname !== "/org-setup" &&
          location.pathname !== "/invite-accept" ? (
            <Navigate to="/org-setup" replace />
          ) : !effectiveNeedsOrgSetup &&
            effectiveNeedsProfileSetup &&
            location.pathname !== "/complete-profile" &&
            location.pathname !== "/invite-accept" ? (
            <Navigate to="/complete-profile" replace />
          ) : null}

          <Routes>
            {/* Redirect auth pages to app */}
            <Route path="/auth" element={<Navigate to="/" replace />} />
            <Route path="/invite" element={<Navigate to="/" replace />} />

            {/* Password reset — must be accessible when authUser is set because
                Supabase creates a recovery session before the user sets their password */}
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Public pages remain accessible when logged in */}
            <Route path="/pricing" element={<PricingPage />} />

            {/* Onboarding */}
            <Route
              path="/org-setup"
              element={
                <OrgSetup
                  orgId={orgId}
                  initialName={effectiveOrgName}
                  onSaved={(name) => setOrgNameLocal(name)}
                />
              }
            />
            <Route
              path="/complete-profile"
              element={
                <CompleteProfile
                  onSaved={() => setProfileCompletedLocal(true)}
                />
              }
            />
            <Route path="/invite-accept" element={<InviteAccept />} />

            {/* Main app */}
            <Route path="/" element={<MainLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="staff" element={<Staff />} />
              <Route path="billing" element={<BillingPage />} />
              <Route path="locations" element={<LocationsPage />} />
              <Route path="requests" element={<RequestsPage />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </>
      )}
    </>
  );
};

export default App;
