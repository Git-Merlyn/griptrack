// stripe-webhook — mirrors Stripe subscription state into public.subscriptions.
//
// Auth: Stripe sends a stripe-signature header and no Supabase JWT, so this
// function is deployed with verify_jwt = false ([functions.stripe-webhook] in
// supabase/config.toml). The signature check below is the only authentication.
//
// Ordering and API versions: event payloads are used only as pointers. Every
// handled event re-fetches the subscription through the pinned SDK and writes
// that fresh state, so a late or retried event can never restore an older
// state, and the payload shape (which follows the webhook endpoint's API
// version in the Stripe dashboard, not the SDK's) does not matter.

import { createClient, type SupabaseClient } from "../_shared/deps.ts";
import Stripe from "npm:stripe@23.0.0";
import { buildPriceToPlan, decideWrite, idOf, subscriptionIdFromInvoice } from "./logic.ts";

const STRIPE_API_VERSION = "2026-09-30.endive";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// new Stripe("") throws, which would turn a missing secret into a boot error
// with no useful log line. Build it only when the key exists.
const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: STRIPE_API_VERSION }) : null;

const { map: PRICE_TO_PLAN, missing: missingPriceEnv } = buildPriceToPlan({
  STRIPE_PRO_PRICE_ID: Deno.env.get("STRIPE_PRO_PRICE_ID"),
  STRIPE_TEAM_PRICE_ID: Deno.env.get("STRIPE_TEAM_PRICE_ID"),
});
if (missingPriceEnv.length > 0) {
  console.error(
    `stripe-webhook: ${missingPriceEnv.join(", ")} not set; subscriptions on those prices keep their stored plan`,
  );
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

type SyncOptions = {
  eventId: string;
  eventType: string;
  orgIdHint: string | null;
  isCheckout: boolean;
};

async function syncSubscription(
  admin: SupabaseClient,
  client: Stripe,
  subscriptionId: string,
  opts: SyncOptions,
): Promise<void> {
  const tag = `[${opts.eventType} ${opts.eventId}]`;

  let fresh: Stripe.Subscription;
  try {
    fresh = await client.subscriptions.retrieve(subscriptionId);
  } catch (err) {
    // A subscription Stripe no longer has (e.g. test data deleted) will never
    // become retrievable; acknowledge instead of letting Stripe retry for days.
    if ((err as { code?: string }).code === "resource_missing") {
      console.warn(`${tag} subscription ${subscriptionId} not found in Stripe; ignoring`);
      return;
    }
    throw err;
  }

  const orgId = fresh.metadata?.org_id || opts.orgIdHint;
  if (!orgId) {
    console.warn(`${tag} subscription ${fresh.id} has no org_id metadata; ignoring`);
    return;
  }

  const { data: stored, error: readError } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id, plan")
    .eq("org_id", orgId)
    .maybeSingle();
  if (readError) throw new Error(`read subscriptions for org ${orgId}: ${readError.message}`);

  const decision = decideWrite({
    fresh,
    stored,
    priceToPlan: PRICE_TO_PLAN,
    isCheckout: opts.isCheckout,
  });

  if (decision.kind === "skip") {
    console.warn(`${tag} org ${orgId}: skipped superseded subscription (${decision.reason})`);
    return;
  }

  if (decision.unmappedPriceId) {
    console.error(
      `${tag} org ${orgId}: price ${decision.unmappedPriceId} is not STRIPE_PRO_PRICE_ID or STRIPE_TEAM_PRICE_ID; ` +
        (decision.plan ? `using plan "${decision.plan}"` : "keeping the stored plan"),
    );
  }

  const row: Record<string, unknown> = {
    org_id: orgId,
    stripe_subscription_id: fresh.id,
    status: decision.status,
    cancel_at_period_end: decision.cancelAtPeriodEnd,
    updated_at: new Date().toISOString(),
  };
  const customerId = idOf(fresh.customer);
  if (customerId) row.stripe_customer_id = customerId;
  if (decision.plan) row.plan = decision.plan;
  // Never overwrite a known period end with null.
  if (decision.currentPeriodEnd) row.current_period_end = decision.currentPeriodEnd;

  const { error: writeError } = await admin.from("subscriptions").upsert(row, { onConflict: "org_id" });
  if (writeError) {
    // 23503 = foreign key violation: the org was deleted (account deletion
    // cascades its subscriptions row). Nothing left to update.
    if (writeError.code === "23503") {
      console.warn(`${tag} org ${orgId} no longer exists; ignoring`);
      return;
    }
    throw new Error(`upsert subscriptions for org ${orgId}: ${writeError.message}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!stripe || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
    console.error(
      "stripe-webhook misconfigured: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are all required",
    );
    // 500 makes Stripe retry, so no event is lost once the secret is set.
    return new Response("Server misconfigured", { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return new Response("Webhook Error: missing stripe-signature header", { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    const message = (err as Error).message;
    console.error("Webhook signature verification failed:", message);
    return new Response(`Webhook Error: ${message}`, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;
        const subscriptionId = idOf(session.subscription);
        if (!subscriptionId) break;
        await syncSubscription(admin, stripe, subscriptionId, {
          eventId: event.id,
          eventType: event.type,
          orgIdHint: session.metadata?.org_id ?? null,
          isCheckout: true,
        });
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscriptionId = idOf(event.data.object);
        if (!subscriptionId) break;
        await syncSubscription(admin, stripe, subscriptionId, {
          eventId: event.id,
          eventType: event.type,
          orgIdHint: null,
          isCheckout: false,
        });
        break;
      }

      case "invoice.payment_failed": {
        const subscriptionId = subscriptionIdFromInvoice(event.data.object);
        if (!subscriptionId) break; // one-off invoice, not a subscription
        await syncSubscription(admin, stripe, subscriptionId, {
          eventId: event.id,
          eventType: event.type,
          orgIdHint: null,
          isCheckout: false,
        });
        break;
      }

      default:
        // Unhandled event type: acknowledge.
        break;
    }
  } catch (err) {
    // Transient (Stripe API or database) failure: 500 so Stripe retries.
    console.error(`Error processing ${event.type} ${event.id}:`, err);
    return new Response(`Handler error: ${(err as Error).message}`, { status: 500 });
  }

  return json({ received: true });
});
