// supabase/functions/invite-staff/index.ts
import { requireUser } from "../_shared/auth.ts";
import { createClient } from "../_shared/deps.ts";
import { corsHeaders, getAppUrl, json } from "../_shared/http.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Identify the caller (401 unless a real signed-in user).
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const { user } = auth;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json({ error: "Missing env" }, 500);
    }

    const body = await req.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const orgId = String(body?.orgId || "").trim();
    // Mirrors shared/roles.ts ASSIGNABLE_ROLES — 'owner' is never grantable.
    const role = String(body?.role || "crew").trim();
    // Optional target team. Empty string / missing => no team.
    const teamId = body?.teamId ? String(body.teamId).trim() : null;

    if (!email || !email.includes("@")) {
      return json({ error: "Invalid email" }, 400);
    }
    if (!orgId) {
      return json({ error: "Missing orgId" }, 400);
    }
    if (!["crew", "department_head", "admin"].includes(role)) {
      return json({ error: "Invalid role" }, 400);
    }

    // Service client for privileged operations
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Verify caller is an admin/owner of org
    const { data: membership, error: memErr } = await admin
      .from("organization_members")
      .select("role,status")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .single();

    if (memErr || !membership || membership.status !== "active") {
      return json({ error: "Forbidden" }, 403);
    }

    const callerRole = String(membership.role || "");
    if (!["owner", "admin"].includes(callerRole)) {
      return json({ error: "Admins only" }, 403);
    }

    // If a team was specified, it must belong to this org — never let an invite
    // point a member at a team in another org.
    if (teamId) {
      const { data: teamRow, error: teamErr } = await admin
        .from("teams")
        .select("id")
        .eq("id", teamId)
        .eq("org_id", orgId)
        .maybeSingle();

      if (teamErr || !teamRow) {
        return json({ error: "Team not found in this organization" }, 400);
      }
    }

    // Rate limit: cap invite emails per org per hour so a compromised or
    // careless admin can't burn the email quota, spam inboxes, or probe which
    // addresses are members through the 409 below. record_invite_send counts
    // and records in one locked transaction, so concurrent requests cannot all
    // slip under the cap, and it fails closed. Every attempt that passes the
    // checks above counts — including re-invites and refusals.
    const RATE_LIMIT_PER_HOUR = 20;
    const { data: underLimit, error: rateErr } = await admin.rpc("record_invite_send", {
      p_org: orgId,
      p_user: user.id,
      p_email: email,
      p_limit: RATE_LIMIT_PER_HOUR,
    });

    if (rateErr) {
      // Fail closed: if we can't record the send, don't send.
      return json({ error: "Could not verify invite rate limit. Please try again." }, 502);
    }
    if (underLimit !== true) {
      return json({ error: "Invite limit reached (20 per hour). Please try again later." }, 429);
    }

    // An invite must never touch an existing membership, and an account can
    // belong to only one org (organization_members_one_org_per_user).
    // invite_target_status: no_account | no_org | member | placeholder_org | other_org
    // (placeholder_org = an untouched auto-created org that accepting will dissolve).
    // Only `member` is reported back: the admin can already see their own
    // member list, so it reveals nothing. Every other outcome, including
    // `other_org`, deliberately gets the same { ok: true } and the same
    // pending invite row, so the response never tells an admin whether an
    // email has a GripTrack account (D12 deferred, Chris 2026-10-21).
    const { data: target, error: targetErr } = await admin.rpc("invite_target_status", {
      p_org: orgId,
      p_email: email,
    });

    if (targetErr) {
      return json({ error: "Could not check this email. Please try again." }, 502);
    }
    if (target === "member") {
      return json(
        {
          error: "This person is already a member of your organization. Change their role from the member list instead.",
        },
        409,
      );
    }
    // No branch for `other_org` on purpose: fall through, upsert the pending
    // invite like any other, and let the existing-account path below return
    // the uniform { ok: true } without sending an email. An other_org invite
    // simply stays pending (accept_org_invite_for_user leaves it alone) until
    // the admin revokes it.

    // Load org name for invite email metadata.
    const { data: orgRow } = await admin
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .single();

    const orgName = String(orgRow?.name || "GripTrack").trim();

    // Load inviter display name for invite email metadata.
    const { data: inviterProfile } = await admin
      .from("profiles")
      .select("full_name,email")
      .eq("id", user.id)
      .single();

    const inviterName =
      String(inviterProfile?.full_name || "").trim() ||
      String(user.email || "").trim() ||
      "Someone";

    // Create/refresh the invite row. A revoked row, or an accepted row whose
    // member has since been removed, goes back to pending. (Existing members
    // were refused above, so this never reopens a live membership's invite.)
    const { error: inviteRowError } = await admin
      .from("org_invites")
      .upsert(
        {
          org_id: orgId,
          email,
          role,
          status: "pending",
          invited_by: user.id,
          team_id: teamId,
          accepted_at: null,
        },
        { onConflict: "org_id,email" },
      );

    if (inviteRowError) {
      return json({ error: inviteRowError.message }, 400);
    }

    // Invite via Supabase Auth.
    // - New address: GoTrue creates the user and emails them an invite link.
    // - Address that already has a confirmed account: GoTrue refuses with
    //   "already registered". We deliberately do NOT mint a sign-in link for
    //   them: handing the caller a magic link for someone else's account is an
    //   account takeover (audit C1). The org_invites row upserted above is all
    //   an existing user needs; accept_org_invite_for_user() attaches them the
    //   next time they sign in.
    // Both outcomes return the identical body, so the response never reveals
    // whether an address has an account.
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      // IMPORTANT: land invited users on the dedicated invite-accept route.
      redirectTo: `${getAppUrl()}/invite-accept?email=${encodeURIComponent(email)}`,
      data: {
        org_name: orgName,
        invited_by_name: inviterName,
      },
    });

    if (inviteErr) {
      const msg = String(inviteErr.message || "").toLowerCase();
      const code = String((inviteErr as { code?: string }).code || "");
      const isAlreadyRegistered =
        code === "email_exists" ||
        (msg.includes("already") && msg.includes("registered")) ||
        (msg.includes("already") && msg.includes("exists")) ||
        msg.includes("already been registered");

      if (!isAlreadyRegistered) {
        return json({ error: inviteErr.message }, 400);
      }
      // Existing account: nothing more to send (see comment above).
    }

    // Shipped mobile builds (4/5) still look for the old "already registered"
    // link fields in this body; with them absent they show their plain
    // "Invite sent" alert. Never add a sign-in URL back to this response.
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error)?.message || "Unknown" }, 500);
  }
});
