// src/lib/orgInvites.js
// Pending-invite actions for the Staff page. Clients may only flip a pending
// invite to 'revoked' (org_invites RLS + a column-level UPDATE grant on
// status); creating and re-sending invites goes through the invite-staff
// edge function.

/**
 * Revoke a pending invite. Throws when nothing was revoked (already accepted
 * or revoked, or the caller is not an owner/admin of the invite's org) —
 * .select() makes an RLS-filtered no-op visible instead of a silent success.
 */
export async function revokeInvite(client, inviteId) {
  const { data, error } = await client
    .from("org_invites")
    .update({ status: "revoked" })
    .eq("id", inviteId)
    .eq("status", "pending")
    .select("id");

  if (error) throw new Error(error.message || "Failed to revoke invite.");
  if (!data?.length) throw new Error("This invite was already accepted or revoked.");
}

/** Body for re-sending an existing pending invite through invite-staff. */
export function resendInviteBody(invite, orgId) {
  return {
    email: invite.email,
    orgId,
    role: invite.role,
    teamId: invite.team_id || null,
  };
}
