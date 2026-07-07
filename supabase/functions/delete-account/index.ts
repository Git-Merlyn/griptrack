// delete-account — cancels any active Stripe subscription, then deletes the
// caller's account via the delete_my_account() RPC.
//
// Why a function instead of calling the RPC directly: SQL can't talk to
// Stripe. The RPC deliberately blocks deletion while a paid subscription is
// active (so a direct RPC call can never leave Stripe charging a deleted
// customer); this function satisfies that check by canceling the
// subscription and syncing its status BEFORE invoking the RPC. The RPC's
// other guard (owner with remaining members) still applies and surfaces as
// an error message to the client.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    // User-scoped client: auth.uid() inside the RPC resolves to the caller.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: memberRow } = await supabase
      .from("organization_members")
      .select("org_id, role")
      .eq("user_id", user.id)
      .single();

    // Owners: auto-cancel any live paid subscription before deletion.
    if (memberRow?.org_id && memberRow.role === "owner") {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const { data: sub } = await adminClient
        .from("subscriptions")
        .select("stripe_subscription_id, status, plan")
        .eq("org_id", memberRow.org_id)
        .single();

      const hasLivePaidSub =
        sub?.stripe_subscription_id &&
        ["active", "trialing"].includes(sub.status ?? "") &&
        (sub.plan ?? "free") !== "free";

      if (hasLivePaidSub) {
        try {
          // Immediate cancellation — the account is about to cease existing,
          // so there is nothing to keep access alive until period end for.
          await stripe.subscriptions.cancel(sub.stripe_subscription_id);
        } catch (e) {
          const msg = (e as { message?: string })?.message ?? "";
          // Already-canceled subscriptions are fine; anything else must stop
          // the deletion — never delete an account Stripe may still charge.
          if (!/No such subscription|canceled/i.test(msg)) {
            console.error("Stripe cancellation failed", msg);
            return json(
              { error: "We couldn't cancel your subscription automatically. Please try again or cancel it from Billing first." },
              502,
            );
          }
        }

        // Sync the row so the RPC's billing guard passes without waiting for
        // the Stripe webhook round trip.
        await adminClient
          .from("subscriptions")
          .update({ status: "canceled", cancel_at_period_end: false })
          .eq("org_id", memberRow.org_id);
      }
    }

    // Run the deletion as the user. The remaining-members guard (and every
    // other rule) is enforced inside the RPC.
    const { error: rpcError } = await supabase.rpc("delete_my_account");
    if (rpcError) return json({ error: rpcError.message }, 400);

    return json({ ok: true });
  } catch (e) {
    console.error("delete-account failed", e);
    return json({ error: "Account deletion failed. Please try again." }, 500);
  }
});
