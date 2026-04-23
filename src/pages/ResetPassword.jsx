import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

// Supabase sends the user to this page with a recovery token in the URL hash.
// The Supabase JS client automatically exchanges the token for a temporary
// session and fires a PASSWORD_RECOVERY auth event. We listen for that event,
// then let the user set a new password.

export default function ResetPassword() {
  const navigate = useNavigate();

  // "waiting" → listening for recovery event
  // "ready"   → recovery session established, show new-password form
  // "done"    → password updated successfully
  // "error"   → no recovery token found or link expired
  const [stage, setStage] = useState("waiting");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    // Listen for the PASSWORD_RECOVERY event that Supabase fires when the
    // recovery link is opened.
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setStage("ready");
      }
    });

    // If Supabase already parsed the hash before this component mounted,
    // check for an existing session with recovery type.
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        // A session exists — could be a normal session or a recovery one.
        // We rely on the onAuthStateChange event above for the recovery case.
        // If the hash is gone (page refresh after recovery), redirect to sign-in.
        if (!window.location.hash.includes("type=recovery") && stage === "waiting") {
          // Give the event listener a moment to fire first
          setTimeout(() => {
            setStage((prev) => (prev === "waiting" ? "error" : prev));
          }, 800);
        }
      } else if (!window.location.hash.includes("access_token")) {
        // No session and no token in hash — stale or invalid link
        setStage("error");
      }
    });

    return () => {
      listener?.subscription?.unsubscribe?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");

    if (password.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords don't match.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setStage("done");
    } catch (e2) {
      setErr(e2?.message || "Failed to update password. Try requesting a new link.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="bg-surface rounded-2xl p-6 w-[92%] max-w-md shadow-lg">
        <h1 className="text-2xl font-bold text-accent mb-1">Reset password</h1>

        {stage === "waiting" && (
          <p className="text-gray-400 text-sm mt-2">Verifying reset link…</p>
        )}

        {stage === "error" && (
          <>
            <p className="text-red-400 text-sm mt-2">
              This reset link is invalid or has expired. Please request a new one.
            </p>
            <button
              type="button"
              onClick={() => navigate("/auth")}
              className="btn-secondary mt-4 w-full"
            >
              Back to sign in
            </button>
          </>
        )}

        {stage === "ready" && (
          <>
            <p className="text-gray-300 text-sm mb-5">Enter your new password.</p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div>
                <label className="text-sm text-gray-300">New password</label>
                <input
                  className="w-full mt-1 px-3 py-2 rounded bg-white text-black"
                  type="password"
                  value={password}
                  onChange={(e) => { setErr(""); setPassword(e.target.value); }}
                  required
                  minLength={8}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm text-gray-300">Confirm password</label>
                <input
                  className="w-full mt-1 px-3 py-2 rounded bg-white text-black"
                  type="password"
                  value={confirm}
                  onChange={(e) => { setErr(""); setConfirm(e.target.value); }}
                  required
                />
              </div>

              {err && <p className="text-red-400 text-sm">{err}</p>}

              <button
                type="submit"
                disabled={busy}
                className={busy ? "btn-disabled" : "btn-accent"}
              >
                {busy ? "Updating…" : "Set new password"}
              </button>
            </form>
          </>
        )}

        {stage === "done" && (
          <>
            <p className="text-green-400 text-sm mt-2">
              Password updated. You're now signed in.
            </p>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="btn-accent mt-4 w-full"
            >
              Go to dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
