import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

// Sign-up role (WP25, TODO 9.17). Stored on the profile by handle_new_user():
// "owner" gets an organization on first sign-in, "crew" waits for an invite.
const SIGNUP_ROLES = [
  { value: "owner", label: "I run a team", hint: "Set up your company and invite your crew." },
  { value: "crew", label: "I work on a team", hint: "Join the team your company already set up." },
];

export default function Auth({ mode: entryMode = "normal" }) {
  const [authMode, setAuthMode] = useState("signin"); // signin | signup | forgot
  const [fullName, setFullName] = useState("");
  const [signupRole, setSignupRole] = useState("");
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
    // Marketing CTAs link to /auth?mode=signup (M10). Read it here rather
    // than in useState so in-app navigation between /auth and
    // /auth?mode=signup also switches the form.
    const modeFromUrl = searchParams.get("mode");
    if (modeFromUrl === "signup" || modeFromUrl === "signin") {
      setErr("");
      setSuccess("");
      setAuthMode(modeFromUrl);
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
        // Invite links are always crew: if the invite was revoked meanwhile,
        // they wait for a new one instead of getting a placeholder org.
        const role = entryMode === "invite" ? "crew" : signupRole;
        if (!role) {
          throw new Error("Choose whether you run a team or work on one");
        }
        const trimmedName = fullName.trim();
        if (!trimmedName) {
          throw new Error("Full name is required");
        }
        if (password.length < 8) {
          throw new Error("Password must be at least 8 characters");
        }

        // Pass the name through signup metadata so handle_new_user() can write
        // it straight to the profile. Without this the name is dropped and the
        // user gets asked for it again on the Complete-profile screen.
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: trimmedName, signup_role: role } },
        });
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
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="bg-surface rounded-2xl p-6 w-[92%] max-w-md shadow-lg">
        <h1 className="text-2xl font-bold text-accent mb-1">{heading}</h1>
        <p className="text-gray-300 mb-6">{subtext}</p>

        <form onSubmit={submit} className="flex flex-col gap-3">
          {authMode === "signup" && !isInviteMode && (
            <fieldset>
              <legend className="text-sm text-gray-300 mb-1">How will you use GripTrack?</legend>
              <div className="grid grid-cols-2 gap-2">
                {SIGNUP_ROLES.map((r) => {
                  const selected = signupRole === r.value;
                  return (
                    <button
                      key={r.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => { setErr(""); setSuccess(""); setSignupRole(r.value); }}
                      className={`flex flex-col items-start justify-start text-left rounded-lg border px-3 py-2.5 transition-colors ${
                        selected
                          ? "border-accent ring-2 ring-accent bg-accent/10 light:bg-accent/15"
                          : "border-gray-700 hover:border-gray-500"
                      }`}
                    >
                      <span className="block text-sm font-semibold text-heading">{r.label}</span>
                      <span className="block text-xs text-gray-400 mt-0.5">{r.hint}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

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
              <label className="text-sm text-gray-300">Password</label>
              <input
                className="w-full mt-1 px-3 py-2 rounded bg-white text-black"
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
            <>
              {authMode === "signin" && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => switchMode("forgot")}
                >
                  Forgot password?
                </button>
              )}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => switchMode(authMode === "signup" ? "signin" : "signup")}
              >
                {authMode === "signup"
                  ? "Have an account? Sign in"
                  : "New here? Create an account"}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
