import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import { supabase } from "@/lib/supabaseClient";
import { redirectToCheckout, redirectToCustomerPortal } from "./stripe";

// Shape of supabase-js FunctionsHttpError: context is the fetch Response.
const httpError = (status, body) => ({
  name: "FunctionsHttpError",
  message: "Edge Function returned a non-2xx status code",
  context: new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
});

describe("redirectToCheckout", () => {
  beforeEach(() => vi.mocked(supabase.functions.invoke).mockReset());

  it("posts only { plan } and navigates to the Checkout URL", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { url: "https://checkout.stripe.com/c/x" }, error: null });
    const navigate = vi.fn();
    await expect(redirectToCheckout("pro", { navigate })).resolves.toEqual({ redirected: true });
    expect(supabase.functions.invoke).toHaveBeenCalledWith("create-checkout-session", { body: { plan: "pro" } });
    expect(navigate).toHaveBeenCalledWith("https://checkout.stripe.com/c/x");
  });

  it("sends confirmSwitch only when the caller confirmed a switch", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { updated: true, plan: "team" }, error: null });
    await redirectToCheckout("team", { navigate: vi.fn(), confirmSwitch: true });
    expect(supabase.functions.invoke).toHaveBeenCalledWith("create-checkout-session", {
      body: { plan: "team", confirmSwitch: true },
    });
  });

  it("returns { updated } for an in-place plan switch without navigating", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { updated: true, plan: "team" }, error: null });
    const navigate = vi.fn();
    await expect(redirectToCheckout("team", { navigate })).resolves.toEqual({ updated: true, plan: "team" });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("surfaces the function's error message, code and status", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: httpError(409, { error: "Your last payment failed.", code: "payment_required" }),
    });
    await expect(redirectToCheckout("team", { navigate: vi.fn() })).rejects.toMatchObject({
      message: "Your last payment failed.",
      code: "payment_required",
      status: 409,
    });
  });

  it("falls back to a generic message when the body is not JSON", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: { message: "Failed to send a request to the Edge Function", context: new Error("offline") },
    });
    await expect(redirectToCheckout("pro", { navigate: vi.fn() })).rejects.toMatchObject({
      message: "Unable to start checkout. Please try again.",
      code: null,
    });
  });

  it("throws when the response has neither url nor updated", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: {}, error: null });
    await expect(redirectToCheckout("pro", { navigate: vi.fn() })).rejects.toThrow("Unable to start checkout");
  });
});

describe("redirectToCustomerPortal", () => {
  beforeEach(() => vi.mocked(supabase.functions.invoke).mockReset());

  it("navigates to the portal URL", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { url: "https://billing.stripe.com/p/x" }, error: null });
    const navigate = vi.fn();
    await redirectToCustomerPortal({ navigate });
    expect(navigate).toHaveBeenCalledWith("https://billing.stripe.com/p/x");
  });

  it("surfaces the function's error message", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: httpError(400, { error: "No billing account found. Please subscribe first." }),
    });
    await expect(redirectToCustomerPortal({ navigate: vi.fn() })).rejects.toThrow("No billing account found");
  });
});
