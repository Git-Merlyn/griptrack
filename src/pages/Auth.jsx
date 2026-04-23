import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

export default function Auth({ mode: entryMode = "normal" }) {
  const [authMode, setAuthMode] = useState("signin"); // signin | signup | forgot
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const emailFromUrl = String(searchParams.get("email") || "").trim();
    if (emailFromUrl) {
      setEmail(emailFromUrl);
    }
  }, [searchParams]);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setSuccess("");
    setBusy(true);
    try {
      if (authMode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSuccess("Check your email for a password reset link.");
        return;
      }

      if (authMode === "signup") {
        const trimmedName = fullName.trim();
        if (!trimmedName) {
          throw new Error("Full name is required");
        }

        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        // If email confirmation is enabled, Supabase often does not return a session here.
        // Show a real success state instead of looking like nothing happened.
        if (!data?.session) {
          setSuccess(
            isInviteMode
              ? "Account created. Check your email to confirm it, then come back and sign in to join your team."
              : "Account created. Check your email to confirm it, then sign in.",
          );
          setPassword("");
          setAuthMode("signin");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (e2) {
      setErr(e2?.message || "Auth failed");
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (mode) => {
    setErr("");
    setSuccess("");
    setAuthMode(mode);
  };

  const isInviteMode = entryMode === "invite";

  const heading = isInviteMode
    ? "You've been invited to join GripTrack"
    : "GripTrack";

  const subtext = authMode === "forgot"
    ? "Enter your email and we'll send you a reset link."
    : isInviteMode
      ? authMode === "signup"
        ? "Create your account to join your team. Your access will be linked automatically."
        : "Sign in to join your team. Your access will be linked automatically."
      : authMode === "signup"
        ? "Create an account"
        : "Sign in";

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="bg-surface rounded-2xl p-6 w-[92%] max-w-md shadow-lg">
        <h1 className="text-2xl font-bold text-accent mb-1">{heading}</h1>
        <p className="text-gray-300 mb-6">{subtext}</p>

        <form onSubmit={submit} className="flex flex-col gap-3">
          {authMode === "signup" && (
            <div>
              <label className="text-sm text-gray-300">Full name</label>
              <input
                className="w-full mt-1 px-3 py-2 rounded bg-white text-black"
                value={fullName}
                onChange={(e) => { setErr(""); setSuccess(""); setFullName(e.target.value); }}
                type="text"
                required
              />
            </div>
          )}

          <div>
            <label className="text-sm text-gray-300">Email</label>
            <input
              className="w-full mt-1 px-3 py-2 rounded bg-white text-black"
              value={email}
              onChange={(e) => { setErr(""); setSuccess(""); setEmail(e.target.value); }}
              type="email"
              required
            />
          </div>

          {authMode !== "forgot" && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-gray-300">Password</label>
                {authMode === "signin" && (
                  <button
                    type="button"
                    onClick={() => switchMode("forgot")}
                    className="text-xs text-gray-500 hover:text-accent transition-colors"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                className="w-full px-3 py-2 rounded bg-white text-black"
                value={password}
                onChange={(e) => { setErr(""); setSuccess(""); setPassword(e.target.value); }}
                type="password"
                required
              />
            </div>
          )}

          {err ? <div className="text-red-400 text-sm">{err}</div> : null}
          {success ? <div className="text-green-400 text-sm">{success}</div> : null}

          <button
            type="submit"
            disabled={busy}
            className={busy ? "btn-disabled" : "btn-accent"}
          >
            {busy
              ? "Please wait…"
              : authMode === "signup"
                ? "Sign up"
                : authMode === "forgot"
                  ? "Send reset link"
                  : "Sign in"}
          </button>

          {authMode === "forgot" ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => switchMode("signin")}
            >
              Back to sign in
            </button>
          ) : (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => switchMode(authMode === "signup" ? "signin" : "signup")}
            >
              {authMode === "signup"
                ? "Have an account? Sign in"
                : "New here? Create an account"}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
