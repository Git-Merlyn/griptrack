import { supabase } from "@/lib/supabaseClient";

// Checkout and the Customer Portal are fully server-side (edge functions
// create-checkout-session / create-portal-session); the browser never loads
// Stripe.js and needs no publishable key.

const goTo = (url) => window.location.assign(url);

// functions.invoke turns every non-2xx into a generic FunctionsHttpError and
// leaves the function's { error, code } JSON unread in error.context (the
// Response). Surface it so the UI can show the real reason.
const toFunctionError = async (error, fallback) => {
  let body = null;
  if (typeof error?.context?.json === "function") {
    try {
      body = await error.context.json();
    } catch {
      // body was not JSON; keep the fallback message
    }
  }
  const err = new Error(body?.error || fallback);
  err.code = body?.code ?? null;
  err.status = error?.context?.status ?? null;
  return err;
};

/**
 * Starts a subscription for `plan` ('pro' | 'team').
 * - No live subscription: navigates to Stripe Checkout; resolves { redirected: true }.
 * - Live subscription on the other plan and `confirmSwitch: true` (the owner
 *   confirmed the switch): the server switches it in place (prorated) and this
 *   resolves { updated: true, plan } without navigating. Without
 *   confirmSwitch the server answers 409 'confirm_switch' instead.
 * Throws an Error carrying .code and .status from the function on failure,
 * e.g. 409 'payment_required' or 'already_on_plan'.
 */
export const redirectToCheckout = async (plan, { navigate = goTo, confirmSwitch = false } = {}) => {
  const { data, error } = await supabase.functions.invoke("create-checkout-session", {
    body: confirmSwitch ? { plan, confirmSwitch: true } : { plan },
  });

  if (error) throw await toFunctionError(error, "Unable to start checkout. Please try again.");
  if (data?.updated) return { updated: true, plan: data.plan ?? plan };
  if (!data?.url) throw new Error("Unable to start checkout. Please try again.");

  navigate(data.url);
  return { redirected: true };
};

/**
 * Opens the Stripe Customer Portal (update card, invoices, cancel).
 */
export const redirectToCustomerPortal = async ({ navigate = goTo } = {}) => {
  const { data, error } = await supabase.functions.invoke("create-portal-session", {
    body: {},
  });

  if (error) throw await toFunctionError(error, "Unable to open the billing portal. Please try again.");
  if (!data?.url) throw new Error("Unable to open the billing portal. Please try again.");

  navigate(data.url);
  return { redirected: true };
};
