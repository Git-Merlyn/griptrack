// src/pages/OrgSetup.jsx
// First-run step: give the organization a real name (orgs start with a
// placeholder such as "New Company"). Routed at /org-setup by App.jsx.
//
// Owner-only: RLS lets only the owner UPDATE organizations, and an
// RLS-refused UPDATE comes back as 2xx with ZERO rows and no error. So the
// UPDATE asks for the row back, and "no row" is reported as "not allowed"
// instead of silently continuing (which looped non-owners back here on every
// reload). Non-owners get an explanation instead of the form.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import useUser from "@/context/useUser";
import { isPlaceholderOrgName } from "@/lib/orgName";

const initialNameFor = (orgName) => (isPlaceholderOrgName(orgName) ? "" : orgName || "");

export default function OrgSetup() {
  const navigate = useNavigate();
  const { orgId, orgName, role, applyOrgName, logout } = useUser();
  const [name, setName] = useState(initialNameFor(orgName));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setName(initialNameFor(orgName));
  }, [orgName]);

  const save = async (e) => {
    e.preventDefault();
    setErr("");

    const trimmed = String(name || "").trim();
    if (!trimmed) {
      setErr("Company name is required.");
      return;
    }
    if (isPlaceholderOrgName(trimmed)) {
      setErr(`"${trimmed}" is a placeholder. Enter your real company name.`);
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("organizations")
        .update({ name: trimmed })
        .eq("id", orgId)
        .select("id, name");

      if (error) throw error;
      if (!data?.length) {
        throw new Error("Only the organization owner can set the company name.");
      }

      applyOrgName(data[0].name ?? trimmed);
      navigate("/", { replace: true });
    } catch (e2) {
      setErr(e2?.message || "Failed to save.");
    } finally {
      setBusy(false);
    }
  };

  if (orgId && role && role !== "owner") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="bg-surface rounded-2xl p-6 w-[92%] max-w-md shadow-lg">
          <h1 className="text-2xl font-bold text-accent mb-1">
            Organization setup
          </h1>
          <p className="text-gray-300 mb-6">
            Your organization&apos;s owner needs to set the company name before
            you can continue. Ask them to sign in to GripTrack and finish
            setup, then reload this page.
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-accent"
            >
              Reload
            </button>
            <button type="button" onClick={logout} className="btn-secondary">
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="bg-surface rounded-2xl p-6 w-[92%] max-w-md shadow-lg">
        <h1 className="text-2xl font-bold text-accent mb-1">
          Organization setup
        </h1>
        <p className="text-gray-300 mb-6">Set your company name to continue.</p>

        <form onSubmit={save} className="flex flex-col gap-3">
          <div>
            <label htmlFor="org-setup-name" className="text-sm text-gray-300">
              Company name
            </label>
            <input
              id="org-setup-name"
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
}
