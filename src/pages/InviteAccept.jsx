import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import useUser from "@/context/useUser";

export default function InviteAccept() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { authUser, loadingOrg, needsOrgSetup, needsProfileSetup } = useUser();

  const invitedEmail = String(searchParams.get("email") || "").trim();

  useEffect(() => {
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
    // If profile is incomplete, send them there first.
    if (needsProfileSetup) {
      navigate("/complete-profile", { replace: true });
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
    invitedEmail,
    loadingOrg,
    navigate,
    needsOrgSetup,
    needsProfileSetup,
  ]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-gray-200">
      <div className="bg-surface rounded-2xl p-6 w-[92%] max-w-md shadow-lg text-center">
        <h1 className="text-2xl font-bold text-accent mb-2">
          Joining your team…
        </h1>
        <p className="texts-gray-300">
          We’re finishing your sign-in and linking your account to the invited
          organization.
        </p>
      </div>
    </div>
  );
}
