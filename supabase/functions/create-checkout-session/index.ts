import { requireUser } from "../_shared/auth.ts";
import { createClient } from "../_shared/deps.ts";
import { corsHeaders, getAppUrl, json } from "../_shared/http.ts";
import Stripe from "npm:stripe@23.0.0";
import {
  decideCheckout,
  parseCheckoutRequest,
  resolvePriceId,
  type StripeSubLite,
} from "../_shared/checkoutPlan.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2026-09-30.endive",
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth: get calling user's org
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const { user, supabase } = auth;

    // Get the user's org
    const { data: memberRow } = await supabase
      .from("organization_members")
      .select("org_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!memberRow?.org_id) return json({ error: "No organization found" }, 400);

    // Only owners can manage billing
    if (memberRow.role !== "owner") {
      return json({ error: "Only the org owner can manage billing" }, 403);
    }

    // Body: { plan: "pro" | "team", interval?: "monthly", confirmSwitch?: true }. Bad JSON, unknown
    // plans (including prototype keys) and "annual" are 400s, not 500s.
    const parsed = parseCheckoutRequest(await req.text());
    if (!parsed.ok) return json({ error: parsed.error }, parsed.status);
    const plan = parsed.plan;

    const priceId = resolvePriceId(plan, {
      pro: Deno.env.get("STRIPE_PRO_PRICE_ID"),
      team: Deno.env.get("STRIPE_TEAM_PRICE_ID"),
    });
    if (!priceId) {
      console.error(`create-checkout-session: no Stripe price id configured for plan '${plan}'`);
      return json({ error: "This plan is not available right now." }, 500);
    }

    // Use the service role client to read/write subscriptions
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: subRow, error: subRowError } = await adminClient
      .from("subscriptions")
      .select("stripe_customer_id, stripe_subscription_id")
      .eq("org_id", memberRow.org_id)
      .maybeSingle();
    if (subRowError) throw new Error(`subscriptions lookup failed: ${subRowError.message}`);

    let customerId: string | null = subRow?.stripe_customer_id ?? null;

    // Stripe, not public.subscriptions, decides what the customer already
    // pays for: the row lags the webhook and only remembers one subscription.
    let existing: StripeSubLite[] = [];
    if (customerId) {
      const list = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
      existing = list.data.map((s) => ({
        id: s.id,
        status: s.status,
        itemId: s.items.data[0]?.id ?? null,
        priceId: s.items.data[0]?.price?.id ?? null,
      }));
    }

    const decision = decideCheckout({
      priceId,
      subscriptions: existing,
      dbSubscriptionId: subRow?.stripe_subscription_id ?? null,
      confirmSwitch: parsed.confirmSwitch,
    });

    if (decision.kind === "reject") {
      return json({ error: decision.error, code: decision.code }, decision.status);
    }

    if (decision.kind === "update") {
      // Plan change on a live active/trialing subscription: swap the price in
      // place (prorated on the next invoice; a trial keeps its end date). The
      // customer.subscription.updated webhook writes the new plan to the DB.
      await stripe.subscriptions.update(decision.subscriptionId, {
        items: [{ id: decision.itemId, price: priceId }],
        proration_behavior: "create_prorations",
        metadata: { org_id: memberRow.org_id },
      });
      return json({ updated: true, plan });
    }

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
      const { error: saveError } = await adminClient
        .from("subscriptions")
        .upsert({ org_id: memberRow.org_id, stripe_customer_id: customerId }, { onConflict: "org_id" });
      if (saveError) throw new Error(`saving stripe_customer_id failed: ${saveError.message}`);
    }

    const appUrl = getAppUrl();

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/billing?success=true`,
      cancel_url: `${appUrl}/billing?canceled=true`,
      allow_promotion_codes: true,
      // A card is required to start, including the 14-day trial: the Stripe
      // trial is the only trial (D33/D38) and it bills automatically when it
      // ends unless the owner cancels first.
      payment_method_collection: "always",
      metadata: { org_id: memberRow.org_id },
      subscription_data: {
        metadata: { org_id: memberRow.org_id },
        // The 14-day trial is for orgs that have never subscribed. A returning
        // (cancelled) customer pays from day one.
        ...(decision.trial
          ? {
              trial_period_days: 14,
              trial_settings: {
                // Cancel the subscription if the card is removed before the
                // trial ends rather than letting it continue without one.
                end_behavior: { missing_payment_method: "cancel" as const },
              },
            }
          : {}),
      },
    });

    return json({ url: session.url });
  } catch (err) {
    console.error("create-checkout-session failed:", err);
    return json({ error: "Unable to start checkout. Please try again." }, 500);
  }
});
