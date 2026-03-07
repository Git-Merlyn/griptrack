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
import PasswordGate from "./components/PasswordGate";
import Auth from "./pages/Auth";
import CompleteProfile from "./pages/CompleteProfile";
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

  // Local override so after saving the org name we don't get stuck on /org-setup
  // even if the provider hasn't reloaded orgName yet.
  const [orgNameLocal, setOrgNameLocal] = useState(null);
  const effectiveOrgName = orgNameLocal ?? orgName;
  const effectiveNeedsOrgSetup = orgNameLocal ? false : needsOrgSetup;

  const [profileCompletedLocal, setProfileCompletedLocal] = useState(false);
  const effectiveNeedsProfileSetup = profileCompletedLocal
    ? false
    : needsProfileSetup;

  return (
    <PasswordGate>
      {!authUser ? (
        <>
          <Routes>
            <Route path="/auth" element={<Auth mode="normal" />} />
            <Route path="/invite" element={<Auth mode="invite" />} />
            <Route path="*" element={<Navigate to="/auth" replace />} />
          </Routes>

          <Analytics />
          <SpeedInsights />
        </>
      ) : loadingOrg ? (
        <>
          <div className="min-h-screen flex items-center justify-center bg-black text-gray-200">
            Loading…
          </div>
          <Analytics />
          <SpeedInsights />
        </>
      ) : (
        <>
          {effectiveNeedsOrgSetup && location.pathname !== "/org-setup" ? (
            <Navigate to="/org-setup" replace />
          ) : !effectiveNeedsOrgSetup &&
            effectiveNeedsProfileSetup &&
            location.pathname !== "/complete-profile" ? (
            <Navigate to="/complete-profile" replace />
          ) : null}

          <Routes>
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

            <Route path="/" element={<MainLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="staff" element={<Staff />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>

          <Analytics />
          <SpeedInsights />
        </>
      )}
    </PasswordGate>
  );
};

export default App;
