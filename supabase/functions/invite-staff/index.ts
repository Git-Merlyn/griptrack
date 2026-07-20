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
    const role = String(body?.role || "staff").trim();
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
    if (!["crew", "department_head", "admin", "owner"].includes(role)) {
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
    // careless admin can't burn the email quota / spam inboxes. Counts sends
    // (including re-invites to the same address), recorded in invite_sends
    // after each successful send below.
    const RATE_LIMIT_PER_HOUR = 20;
    const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentSends, error: rateErr } = await admin
      .from("invite_sends")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("at", windowStart);

    if (rateErr) {
      // Fail closed-ish: if we can't check, don't silently allow unlimited sends.
      return new Response(JSON.stringify({ error: "Could not verify invite rate limit. Please try again." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if ((recentSends ?? 0) >= RATE_LIMIT_PER_HOUR) {
      return new Response(
        JSON.stringify({ error: "Invite limit reached (20 per hour). Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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

    // Create/refresh invite row (pending)
    const { error: inviteRowError } = await admin
  .from("org_invites")
  .upsert(
    {
      org_id: orgId,
      email,
      role: role === "owner" ? "admin" : role,
      status: "pending",
      invited_by: user.id,
      team_id: teamId,
    },
    { onConflict: "org_id,email" }
  );

if (inviteRowError) {
  return new Response(JSON.stringify({ error: inviteRowError.message }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

    // Invite via Supabase Auth.
    // - Brand new user: send the normal invite email.
    // - Existing user: generate a magic link so the app can still give them a fresh join link.
    let alreadyRegistered = false;
    let invitedUserId: string | null = null;
    let generatedLink: string | null = null;

    const { data: inviteData, error: inviteErr } =
      await admin.auth.admin.inviteUserByEmail(email, {
        // IMPORTANT: land invited users on the dedicated invite-accept route.
        redirectTo: `https://griptrack.app/invite-accept?email=${encodeURIComponent(email)}`,
        data: {
          org_name: orgName,
          invited_by_name: inviterName,
        },
      });

    if (inviteErr) {
      const msg = String(inviteErr.message || "").toLowerCase();
      const isAlreadyRegistered =
        (msg.includes("already") && msg.includes("registered")) ||
        (msg.includes("already") && msg.includes("exists")) ||
        msg.includes("already been registered");

      if (isAlreadyRegistered) {
        alreadyRegistered = true;

        const { data: linkData, error: linkErr } =
          await admin.auth.admin.generateLink({
            type: "magiclink",
            email,
            options: {
              redirectTo: `https://griptrack.app/invite-accept?email=${encodeURIComponent(email)}`,
              data: {
                org_name: orgName,
                invited_by_name: inviterName,
              },
            },
          });

        if (linkErr) {
          return new Response(JSON.stringify({ error: linkErr.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        generatedLink = linkData?.properties?.action_link ?? null;
      } else {
        return new Response(JSON.stringify({ error: inviteErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      invitedUserId = inviteData?.user?.id ?? null;
    }

    // Record the send for rate limiting (both the email path and the
    // magic-link path count — each is an outbound invite).
    await admin.from("invite_sends").insert({
      org_id: orgId,
      user_id: user.id,
      email,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        alreadyRegistered,
        invitedUserId,
        generatedLink,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});