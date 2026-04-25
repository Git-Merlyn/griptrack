import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

const PRICE_IDS: Record<string, string> = {
  pro: Deno.env.get("STRIPE_PRO_PRICE_ID") ?? "",
  team: Deno.env.get("STRIPE_TEAM_PRICE_ID") ?? "",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth: get calling user's org
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the user's org
    const { data: memberRow } = await supabase
      .from("organization_members")
      .select("org_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!memberRow?.org_id) {
      return new Response(JSON.stringify({ error: "No organization found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only owners can manage billing
    if (memberRow.role !== "owner") {
      return new Response(JSON.stringify({ error: "Only the org owner can manage billing" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { plan } = await req.json();
    const priceId = PRICE_IDS[plan];

    if (!priceId) {
      return new Response(JSON.stringify({ error: `Unknown plan: ${plan}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use the service role client to read/write subscriptions
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get or create Stripe customer
    const { data: subRow } = await adminClient
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("org_id", memberRow.org_id)
      .single();

    let customerId = subRow?.stripe_customer_id;

    if (!customerId) {
      const { data: orgRow } = await adminClient
        .from("organizations")
        .select("name, billing_email")
        .eq("id", memberRow.org_id)
        .single();

      const customer = await stripe.customers.create({
        email: orgRow?.billing_email ?? user.email ?? undefined,
        name: orgRow?.name ?? undefined,
        metadata: { org_id: memberRow.org_id },
      });

      customerId = customer.id;

      // Save customer id back to subscriptions table
      await adminClient
        .from("subscriptions")
        .upsert({ org_id: memberRow.org_id, stripe_customer_id: customerId }, { onConflict: "org_id" });
    }

    const appUrl = Deno.env.get("APP_URL") ?? "https://griptrack.app";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/billing?success=true`,
      cancel_url: `${appUrl}/billing?canceled=true`,
      allow_promotion_codes: true,
      // Require card upfront so Stripe can enforce one trial per card.
      // If the same card has already had a trial, Stripe skips it and charges immediately.
      payment_method_collection: "always",
      metadata: { org_id: memberRow.org_id },
      subscription_data: {
        metadata: { org_id: memberRow.org_id },
        trial_period_days: 14,
        trial_settings: {
          // Cancel the subscription if the card is removed before trial ends
          // rather than letting it continue without a payment method.
          end_behavior: { missing_payment_method: "cancel" },
        },
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
