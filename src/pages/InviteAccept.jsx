import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import useUser from "@/context/useUser";

export default function InviteAccept() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { authUser, loadingOrg, needsOrgSetup, needsProfileSetup, profile } =
    useUser();

  const invitedEmail = String(searchParams.get("email") || "").trim();

  const [statusMessage, setStatusMessage] = useState(
    "We’re finishing your sign-in and linking your account to the invited organization.",
  );

  const hashParams = useMemo(() => {
    const raw = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    return new URLSearchParams(raw);
  }, []);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFullName(String(profile?.full_name || ""));
    setPhone(String(profile?.phone || ""));
  }, [profile]);

  useEffect(() => {
    const inviteError = String(hashParams.get("error") || "").trim();
    const inviteErrorCode = String(hashParams.get("error_code") || "").trim();
    const inviteErrorDescription = String(
      hashParams.get("error_description") || "",
    ).trim();

    if (inviteError) {
      const isExpired =
        inviteErrorCode === "otp_expired" ||
        inviteErrorDescription.toLowerCase().includes("expired") ||
        inviteErrorDescription.toLowerCase().includes("invalid");

      if (isExpired) {
        setStatusMessage(
          "This invite link is invalid or has expired. Please request a fresh invite or sign in if you already have access.",
        );
      } else {
        setStatusMessage(
          inviteErrorDescription ||
            "We couldn’t complete this invite link. Please try again.",
        );
      }

      const next = invitedEmail
        ? `/invite?email=${encodeURIComponent(invitedEmail)}`
        : "/invite";
      const timer = window.setTimeout(() => {
        navigate(next, { replace: true });
      }, 1800);

      return () => window.clearTimeout(timer);
    }

    // Wait until auth/org bootstrap finishes. UserProvider already handles:
    // 1) accept_org_invite_for_user()
    // 2) ensure_org_for_user()
    if (loadingOrg) return;

    // If no authenticated user/session yet, send them to the invite-branded auth page.
    if (!authUser) {
      const next = invitedEmail
        ? `/invite?email=${encodeURIComponent(invitedEmail)}`
        : "/invite";
      navigate(next, { replace: true });
      return;
    }

    // Authenticated + org bootstrap complete.
    // If profile is incomplete, stay on this page and let the invited user
    // finish onboarding here (set name / optional phone / password).
    if (needsProfileSetup) {
      return;
    }

    // Invited users should NEVER create a new org. If an invite exists,
    // org bootstrap should attach them automatically. If something still
    // reports needsOrgSetup while coming from an invite, send them to the
    // dashboard instead of org setup to prevent accidental org creation.
    if (needsOrgSetup) {
      if (invitedEmail) {
        navigate("/", { replace: true });
      } else {
        navigate("/org-setup", { replace: true });
      }
      return;
    }

    // Happy path: session exists, invite consumed, org attached, profile complete.
    navigate("/", { replace: true });
  }, [
    authUser,
    hashParams,
    invitedEmail,
    loadingOrg,
    navigate,
    needsOrgSetup,
    needsProfileSetup,
  ]);

  const submit = async (e) => {
    e.preventDefault();
    setFormError("");

    const trimmedName = String(fullName || "").trim();
    const trimmedPhone = String(phone || "").trim();

    if (!authUser?.id) {
      setFormError("No signed-in user found.");
      return;
    }

    if (!trimmedName) {
      setFormError("Full name is required.");
      return;
    }

    if (!password) {
      setFormError("Please create a password.");
      return;
    }

    if (password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const { error: passwordError } = await supabase.auth.updateUser({
        password,
      });
      if (passwordError) throw passwordError;

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: authUser.id,
        email: authUser.email?.trim().toLowerCase() || null,
        full_name: trimmedName,
        phone: trimmedPhone || null,
      });
      if (profileError) throw profileError;

      navigate("/", { replace: true });
    } catch (e2) {
      setFormError(e2?.message || "Failed to finish invite setup.");
    } finally {
      setBusy(false);
    }
  };

  return authUser && !loadingOrg && needsProfileSetup ? (
    <div className="min-h-screen flex items-center justify-center bg-black text-gray-200">
      <div className="bg-surface rounded-2xl p-6 w-[92%] max-w-md shadow-lg">
        <h1 className="text-2xl font-bold text-accent mb-2">
          Finish joining your team
        </h1>
        <p className="text-gray-300 mb-6">
          Set your name and password to complete your GripTrack account.
        </p>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label className="text-sm text-gray-300">Full name</label>
            <input
              className="w-full mt-1 px-3 py-2 rounded bg-white text-black"
              value={fullName}
              onChange={(e) => {
                setFormError("");
                setFullName(e.target.value);
              }}
              type="text"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="text-sm text-gray-300">Phone (optional)</label>
            <input
              className="w-full mt-1 px-3 py-2 rounded bg-white text-black"
              value={phone}
              onChange={(e) => {
                setFormError("");
                setPhone(e.target.value);
              }}
              type="tel"
              placeholder="(555) 555-5555"
            />
          </div>

          <div>
            <label className="text-sm text-gray-300">Create password</label>
            <input
              className="w-full mt-1 px-3 py-2 rounded bg-white text-black"
              value={password}
              onChange={(e) => {
                setFormError("");
                setPassword(e.target.value);
              }}
              type="password"
              required
            />
          </div>

          <div>
            <label className="text-sm text-gray-300">Confirm password</label>
            <input
              className="w-full mt-1 px-3 py-2 rounded bg-white text-black"
              value={confirmPassword}
              onChange={(e) => {
                setFormError("");
                setConfirmPassword(e.target.value);
              }}
              type="password"
              required
            />
          </div>

          {formError ? (
            <div className="text-red-400 text-sm">{formError}</div>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className={busy ? "btn-disabled" : "btn-accent"}
          >
            {busy ? "Finishing…" : "Finish setup"}
          </button>
        </form>
      </div>
    </div>
  ) : (
    <div className="min-h-screen flex items-center justify-center bg-black text-gray-200">
      <div className="bg-surface rounded-2xl p-6 w-[92%] max-w-md shadow-lg text-center">
        <h1 className="text-2xl font-bold text-accent mb-2">
          Joining your team…
        </h1>
        <p className="text-gray-300">{statusMessage}</p>
      </div>
    </div>
  );
}
