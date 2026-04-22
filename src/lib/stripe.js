import { supabase } from "@/lib/supabaseClient";

// Internal: loads Stripe.js from CDN idempotently.
let _stripePromise = null;
const _loadStripe = () => {
  if (_stripePromise) return _stripePromise;

  _stripePromise = new Promise((resolve, reject) => {
    if (window.Stripe) {
      resolve(window.Stripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.onload = () => {
      resolve(window.Stripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY));
    };
    script.onerror = () => reject(new Error("Failed to load Stripe.js"));
    document.head.appendChild(script);
  });

  return _stripePromise;
};

/**
 * Creates a Stripe Checkout session via Edge Function and redirects
 * the user to the hosted payment page.
 */
export const redirectToCheckout = async (plan) => {
  const { data, error } = await supabase.functions.invoke("create-checkout-session", {
    body: { plan },
  });

  if (error) throw error;
  if (!data?.url) throw new Error("No checkout URL returned");

  window.location.href = data.url;
};

/**
 * Opens the Stripe Customer Portal so users can manage/cancel their subscription.
 */
export const redirectToCustomerPortal = async () => {
  const { data, error } = await supabase.functions.invoke("create-portal-session", {
    body: {},
  });

  if (error) throw error;
  if (!data?.url) throw new Error("No portal URL returned");

  window.location.href = data.url;
};
