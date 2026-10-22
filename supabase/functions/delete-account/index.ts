// delete-account — stops all Stripe billing for the caller's org (owners
// only), then deletes the caller's account via the delete_my_account() RPC.
//
// Why a function instead of calling the RPC directly: SQL can't talk to
// Stripe. The RPC refuses deletion while the org still has a non-terminal
// Stripe subscription recorded (so a direct RPC call can never leave Stripe
// billing a deleted org); this function satisfies that check by deleting the
// org's Stripe customer (which cancels every subscription on it) and syncing
// the subscriptions row BEFORE invoking the RPC.
//
// Order matters (audit M22): every guard that can refuse the deletion must
// run BEFORE any irreversible Stripe call. The RPC's remaining-members guard
// is therefore mirrored below; keep its count and message identical to
// public.delete_my_account() in supabase/migrations.

import { requireUser } from "../_shared/auth.ts";
import { createClient } from "../_shared/deps.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import Stripe from "npm:stripe@23.0.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2026-09-30.endive",
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // User-scoped client: auth.uid() inside the RPC resolves to the caller.
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const { user, supabase } = auth;

    // organization_members has a UNIQUE(user_id) constraint, so at most one
    // row can ever match — .single() is safe. PGRST116 = no membership row
    // (valid: not every account has an org); any other error means we can't
    // confirm the caller's org/role, so fail closed rather than silently
    // skipping the billing-cancellation step below.
    const { data: memberRow, error: memberError } = await supabase
      .from("organization_members")
      .select("org_id, role")
      .eq("user_id", user.id)
      .single();

    if (memberError && memberError.code !== "PGRST116") {
      console.error("Failed to look up membership before deletion", memberError.message);
      return json(
        { error: "We couldn't verify your account before deletion. Please try again." },
        502,
      );
    }

    // Owners: refuse early if the RPC would refuse, then stop all billing.
    if (memberRow?.org_id && memberRow.role === "owner") {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      // Mirror of the RPC's remaining-members guard (same count, same
      // message). It must run before Stripe: an immediate cancel cannot be
      // undone, and the RPC would otherwise refuse AFTER billing was gone.
      const { count: otherMembers, error: countError } = await adminClient
        .from("organization_members")
        .select("user_id", { count: "exact", head: true })
        .eq("org_id", memberRow.org_id)
        .neq("user_id", user.id);

      if (countError) {
        console.error("Failed to count org members before deletion", countError.message);
        return json(
          { error: "We couldn't verify your organization before deletion. Please try again." },
          502,
        );
      }
      if ((otherMembers ?? 0) > 0) {
        return json(
          {
            error: `Your organization still has ${otherMembers} other member(s). Remove them from Staff (or transfer ownership) before deleting your account.`,
          },
          400,
        );
      }

      const { data: sub, error: subError } = await adminClient
        .from("subscriptions")
        .select("stripe_customer_id, stripe_subscription_id, status")
        .eq("org_id", memberRow.org_id)
        .single();

      // PGRST116 = no subscription row — nothing to cancel, safe to proceed.
      // Any other error means we can't confirm billing is inactive; fail
      // closed rather than risk deleting an account Stripe might still charge.
      if (subError && subError.code !== "PGRST116") {
        console.error("Failed to look up subscription before deletion", subError.message);
        return json(
          { error: "We couldn't verify your subscription status. Please try again." },
          502,
        );
      }

      // Any Stripe linkage at all — regardless of the stored status, which
      // can be stale or past_due/unpaid (audit M21) — gets shut down.
      if (sub?.stripe_customer_id || sub?.stripe_subscription_id) {
        try {
          if (sub.stripe_customer_id) {
            // Deleting the customer immediately cancels EVERY subscription on
            // it (including any untracked duplicate) and removes the stored
            // payment method. Invoices stay in Stripe for accounting.
            await stripe.customers.del(sub.stripe_customer_id);
          } else {
            // No customer id recorded (should not happen): cancel the one
            // subscription we know about.
            await stripe.subscriptions.cancel(sub.stripe_subscription_id!);
          }
        } catch (e) {
          const err = e as { code?: string; message?: string };
          const msg = err?.message ?? "";
          // Already-deleted customers / already-canceled subscriptions are
          // fine; anything else must stop the deletion — never delete an
          // account Stripe may still charge.
          const alreadyGone =
            err?.code === "resource_missing" ||
            /No such (customer|subscription)|canceled/i.test(msg);
          if (!alreadyGone) {
            console.error("Stripe cancellation failed", msg);
            return json(
              { error: "We couldn't cancel your subscription automatically. Please try again or cancel it from Billing first." },
              502,
            );
          }
        }

        // Sync the row so the RPC's billing guard passes without waiting for
        // the Stripe webhook round trip. The Stripe ids are cleared because
        // the customer no longer exists; if the RPC then fails for an
        // unrelated reason, the org is left consistently on Free and a later
        // checkout creates a fresh customer.
        const { error: syncError } = await adminClient
          .from("subscriptions")
          .update({
            status: "canceled",
            plan: "free",
            cancel_at_period_end: false,
            stripe_customer_id: null,
            stripe_subscription_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("org_id", memberRow.org_id);

        if (syncError) {
          console.error("Failed to sync subscription after Stripe cancellation", syncError.message);
          return json(
            { error: "Your subscription was cancelled, but we couldn't finish updating your account. Please try again in a moment." },
            502,
          );
        }
      }
    }

    // Run the deletion as the user. Every rule (including the members and
    // billing guards above) is enforced again inside the RPC.
    const { error: rpcError } = await supabase.rpc("delete_my_account");
    if (rpcError) return json({ error: rpcError.message }, 400);

    return json({ ok: true });
  } catch (e) {
    console.error("delete-account failed", e);
    return json({ error: "Account deletion failed. Please try again." }, 500);
  }
});
