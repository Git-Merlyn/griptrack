// supabase/functions/invite-staff/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Missing env" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Client using end-user JWT (to identify caller)
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();

    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const orgId = String(body?.orgId || "").trim();
    // Mirrors shared/roles.ts ASSIGNABLE_ROLES — 'owner' is never grantable.
    const role = String(body?.role || "crew").trim();
    // Optional target team. Empty string / missing => no team.
    const teamId = body?.teamId ? String(body.teamId).trim() : null;

    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Invalid email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!orgId) {
      return new Response(JSON.stringify({ error: "Missing orgId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!["crew", "department_head", "admin"].includes(role)) {
      return new Response(JSON.stringify({ error: "Invalid role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerRole = String(membership.role || "");
    if (!["owner", "admin"].includes(callerRole)) {
      return new Response(JSON.stringify({ error: "Admins only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
        return new Response(JSON.stringify({ error: "Team not found in this organization" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Rate limit: cap invite emails per org per hour so a compromised or
    // careless admin can't burn the email quota or spam inboxes.
    // record_invite_send counts
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
      return new Response(JSON.stringify({ error: "Could not verify invite rate limit. Please try again." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (underLimit !== true) {
      return new Response(
        JSON.stringify({ error: "Invite limit reached (20 per hour). Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // An invite must never touch an existing membership, and an account can
    // belong to only one org (organization_members_one_org_per_user).
    // invite_target_status: no_account | no_org | member | placeholder_org | other_org
    // (placeholder_org = an untouched auto-created org that accepting will dissolve).
    // Only `member` is reported back: the admin can already see their own
    // member list, so it reveals nothing. Every other outcome — including
    // `other_org` — deliberately gets the same { ok: true } and the same
    // pending invite row, so the response never tells an admin whether an
    // email has a GripTrack account (Decision 2, Chris 2026-10-21). An
    // other_org invite simply stays pending (accept_org_invite_for_user leaves
    // it alone) until the admin revokes it.
    const { data: target, error: targetErr } = await admin.rpc("invite_target_status", {
      p_org: orgId,
      p_email: email,
    });

    if (targetErr) {
      return new Response(JSON.stringify({ error: "Could not check this email. Please try again." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (target === "member") {
      return new Response(
        JSON.stringify({
          error: "This person is already a member of your organization. Change their role from the member list instead.",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    // No branch for `other_org` on purpose (see comment above): fall through,
    // upsert the pending invite like any other, and let the existing-account
    // path below return the uniform { ok: true } without sending an email.

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
      return new Response(JSON.stringify({ error: inviteRowError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      redirectTo: `https://griptrack.app/invite-accept?email=${encodeURIComponent(email)}`,
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
        return new Response(JSON.stringify({ error: inviteErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Existing account: nothing more to send (see comment above).
    }

    // Shipped mobile builds (4/5) still look for the old "already registered"
    // link fields in this body; with them absent they show their plain
    // "Invite sent" alert. Never add a sign-in URL back to this response.
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});