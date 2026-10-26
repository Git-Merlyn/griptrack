// src/pages/WaitingForInvite.jsx
// Shown to a user who signed up with "I work on a team" and is not in any
// organization yet (WP25, TODO 9.17). Routed at /waiting by App.jsx.
//
// bootstrap_session accepts a pending invite for the user's email on every
// call, so "checking" is just calling it again. The quiet check runs the RPC
// directly and only re-bootstraps the app (which shows the loading screen)
// once an org comes back.
import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import useUser from "@/context/useUser";
import useConfirm from "@/hooks/useConfirm";
import { DeleteAccountDialog } from "@/components/dialogs/AccountDialogs";

export const RECHECK_MS = 30_000;

export default function WaitingForInvite() {
  const navigate = useNavigate();
  const { authUser, profile, awaitingInvite, rebootstrap, logout } = useUser();
  const [confirm, confirmDialog] = useConfirm();
  const [checking, setChecking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const inFlight = useRef(false);

  const email = profile?.email || authUser?.email || "";

  // quiet: background re-check (timer, tab focus) that shows nothing unless
  // an invite was found.
  const check = useCallback(
    async ({ quiet = false } = {}) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (!quiet) {
        setChecking(true);
        setNote("");
        setErr("");
      }
      try {
        const { data, error } = await supabase.rpc("bootstrap_session");
        if (error) throw error;
        if (data?.org_id) {
          await rebootstrap();
          navigate("/", { replace: true });
        } else if (!quiet) {
          setNote("No invite yet. We'll keep checking while this page is open.");
        }
      } catch (e) {
        if (!quiet) setErr(e?.message || "Couldn't check right now. Try again in a moment.");
      } finally {
        inFlight.current = false;
        if (!quiet) setChecking(false);
      }
    },
    [rebootstrap, navigate],
  );

  useEffect(() => {
    if (!awaitingInvite) return undefined;
    const quietCheck = () => {
      if (document.visibilityState === "visible") check({ quiet: true });
    };
    const timer = setInterval(quietCheck, RECHECK_MS);
    window.addEventListener("focus", quietCheck);
    document.addEventListener("visibilitychange", quietCheck);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", quietCheck);
      document.removeEventListener("visibilitychange", quietCheck);
    };
  }, [awaitingInvite, check]);

  const startOwnOrg = async () => {
    const ok = await confirm({
      title: "Set up your own company?",
      message: "You'll create a new GripTrack organization and be its owner.",
      confirmLabel: "Set up my company",
    });
    if (!ok) return;
    setStarting(true);
    setErr("");
    try {
      const { error } = await supabase.rpc("start_own_org");
      if (error) throw error;
      await rebootstrap();
      navigate("/org-setup", { replace: true });
    } catch (e) {
      setErr(e?.message || "Couldn't create your organization. Please try again.");
      setStarting(false);
    }
  };

  if (!awaitingInvite) return <Navigate to="/" replace />;

  const busy = checking || starting;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="bg-surface rounded-2xl p-6 w-full max-w-md shadow-lg">
        <h1 className="text-2xl font-bold text-accent mb-1">Waiting for an invite</h1>
        <p className="text-gray-300 mb-4">
          Ask your team&apos;s admin to invite this email address from their Staff page:
        </p>
        <p
          data-testid="waiting-email"
          className="font-mono text-heading bg-background border border-gray-700 rounded-lg px-3 py-2 mb-4 break-all"
        >
          {email}
        </p>
        <p className="text-gray-400 text-sm mb-6">
          You&apos;ll join their team automatically. This page checks every 30 seconds, and the
          mobile app checks whenever you open it.
        </p>

        {note ? <div className="text-gray-300 text-sm mb-3" role="status">{note}</div> : null}
        {err ? <div className="text-red-400 text-sm mb-3" role="alert">{err}</div> : null}

        <div className="flex flex-col gap-3">
          <button
            type="button"
            className={busy ? "btn-disabled" : "btn-accent"}
            disabled={busy}
            onClick={() => check()}
          >
            {checking ? "Checking…" : "Check again"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={startOwnOrg}
          >
            {starting ? "Setting up…" : "I run a team instead"}
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={logout}>
            Sign out
          </button>
          <button
            type="button"
            className="text-sm text-gray-500 hover:text-red-400 transition-colors mt-1"
            disabled={busy}
            onClick={() => setDeleteOpen(true)}
          >
            Delete account
          </button>
        </div>
      </div>

      <DeleteAccountDialog isOpen={deleteOpen} onClose={() => setDeleteOpen(false)} isOwner={false} />
      {confirmDialog}
    </div>
  );
}
