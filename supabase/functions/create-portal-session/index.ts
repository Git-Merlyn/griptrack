import { requireUser } from "../_shared/auth.ts";
import { createClient } from "../_shared/deps.ts";
import { corsHeaders, getAppUrl, json } from "../_shared/http.ts";
import Stripe from "npm:stripe@23.0.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2026-09-30.endive",
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const { user, supabase } = auth;

    const { data: memberRow } = await supabase
      .from("organization_members")
      .select("org_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!memberRow?.org_id || memberRow.role !== "owner") {
      return json({ error: "Only the org owner can manage billing" }, 403);
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: subRow } = await adminClient
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("org_id", memberRow.org_id)
      .single();

    if (!subRow?.stripe_customer_id) {
      return json({ error: "No billing account found. Please subscribe first." }, 400);
    }

    const appUrl = getAppUrl();

    const session = await stripe.billingPortal.sessions.create({
      customer: subRow.stripe_customer_id,
      return_url: `${appUrl}/billing`,
    });

    return json({ url: session.url });
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message }, 500);
  }
});
