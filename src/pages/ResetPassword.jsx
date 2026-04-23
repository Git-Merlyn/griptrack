import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

// Supabase sends the user here with a recovery token in the URL hash.
// The Supabase JS client exchanges the token for a session and fires
// PASSWORD_RECOVERY via onAuthStateChange. We wait for that event.
//
// IMPORTANT: Do NOT use window.location.hash to detect recovery — Supabase
// clears the hash before this component mounts, making hash checks unreliable.

export default function ResetPassword() {
  const navigate = useNavigate();

  // "waiting" → listening for PASSWORD_RECOVERY event
  // "ready"   → recovery session confirmed, show new-password form
  // "done"    → password updated successfully
  // "error"   → no recovery event after timeout, or link already used
  const [stage, setStage] = useState("waiting");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    // Listen for the PASSWORD_RECOVERY event Supabase fires after exchanging
    // the token. This is the only reliable signal — don't rely on the URL hash.
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setStage("ready");
      }
    });

    // Fallback: if PASSWORD_RECOVERY hasn't fired after 3 seconds,
    // the link is stale, already used, or the user landed here directly.
    const timeout = setTimeout(() => {
      setStage((prev) => (prev === "waiting" ? "error" : prev));
    }, 3000);

    return () => {
      listener?.subscription?.unsubscribe?.();
      clearTimeout(timeout);
    };
  }, []);

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

  // Sign out before navigating back so the recovery session doesn't
  // accidentally log the user into the app.
  const handleBackToSignIn = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="bg-surface rounded-2xl p-6 w-[92%] max-w-md shadow-lg">
        <h1 className="text-2xl font-bold text-accent mb-1">Reset password</h1>

        {stage === "waiting" && (
          <p className="text-gray-400 text-sm mt-2 animate-pulse">
            Verifying reset link…
          </p>
        )}

        {stage === "error" && (
          <>
            <p className="text-red-400 text-sm mt-2">
              This reset link is invalid or has already been used. Please request a new one.
            </p>
            <button
              type="button"
              onClick={handleBackToSignIn}
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
              Password updated successfully.
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
