import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import useUser from "@/context/useUser";
import { redirectToCheckout, redirectToCustomerPortal } from "@/lib/stripe";
import BillingPage from "./BillingPage";

vi.mock("@/context/useUser");
vi.mock("@/lib/stripe", () => ({
  redirectToCheckout: vi.fn(),
  redirectToCustomerPortal: vi.fn(),
}));

const FREE_ROW = { plan: "free", status: "active", current_period_end: null, cancel_at_period_end: false };
const PRO_ROW = { plan: "pro", status: "active", current_period_end: "2026-11-21T00:00:00Z", cancel_at_period_end: false };

// Mirrors UserProvider's derived plan: paid only while active/trialing.
const derivePlan = (sub) =>
  sub && (sub.status === "active" || sub.status === "trialing") ? sub.plan ?? "free" : "free";

let refreshSubscription;

const setUser = ({ subscription = FREE_ROW, role = "owner" } = {}) => {
  vi.mocked(useUser).mockReturnValue({
    plan: derivePlan(subscription),
    role,
    subscription,
    loadingSubscription: false,
    refreshSubscription,
  });
};

const LocationProbe = () => {
  const loc = useLocation();
  return <div data-testid="search">{loc.search}</div>;
};

const renderAt = (url = "/billing") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/billing"
          element={
            <>
              <BillingPage />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  refreshSubscription = vi.fn().mockResolvedValue(FREE_ROW);
  vi.mocked(redirectToCheckout).mockReset();
  vi.mocked(redirectToCustomerPortal).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("BillingPage — H5 past_due", () => {
  it("shows the paid plan, a payment-failed banner and the portal; never Upgrade", () => {
    setUser({ subscription: { ...PRO_ROW, status: "past_due" } });
    renderAt();

    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText("Payment failed")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Your last payment failed");
    expect(screen.getByRole("button", { name: "Update payment method" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Upgrade/ })).not.toBeInTheDocument();
  });

  it("Update payment method opens the portal", async () => {
    const user = userEvent.setup();
    setUser({ subscription: { ...PRO_ROW, status: "unpaid" } });
    vi.mocked(redirectToCustomerPortal).mockResolvedValue({ redirected: true });
    renderAt();

    await user.click(screen.getByRole("button", { name: "Update payment method" }));
    expect(redirectToCustomerPortal).toHaveBeenCalledTimes(1);
    expect(redirectToCheckout).not.toHaveBeenCalled();
  });
});

describe("BillingPage — plan states", () => {
  it("default free org: Upgrade to Pro, no badge, no portal button", () => {
    setUser({ subscription: FREE_ROW });
    renderAt();
    expect(screen.getByRole("button", { name: /Upgrade to Pro/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Manage subscription|Billing history/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
    // D33/D38: the Stripe trial needs a card; never "no credit card required"
    expect(screen.getByText(/14-day free trial/)).toHaveTextContent("A card is required to start");
    expect(screen.queryByText(/no credit card/i)).not.toBeInTheDocument();
  });

  it("free org: Upgrade to Pro starts Checkout without a confirm and without confirmSwitch", async () => {
    const user = userEvent.setup();
    setUser({ subscription: FREE_ROW });
    vi.mocked(redirectToCheckout).mockResolvedValue({ redirected: true });
    renderAt();

    await user.click(screen.getByRole("button", { name: /Upgrade to Pro/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(redirectToCheckout).toHaveBeenCalledWith("pro", { confirmSwitch: false });
  });

  it("previously cancelled org: Upgrade to Pro plus Billing history, label 'Cancelled'", () => {
    setUser({ subscription: { ...FREE_ROW, status: "canceled", current_period_end: "2026-09-01T00:00:00Z" } });
    renderAt();
    expect(screen.getByRole("button", { name: /Upgrade to Pro/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Billing history" })).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.queryByText(/Next billing date/)).not.toBeInTheDocument();
  });

  it("non-owner sees no billing actions", () => {
    setUser({ subscription: PRO_ROW, role: "admin" });
    renderAt();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/Only the organization owner/)).toBeInTheDocument();
  });
});

describe("BillingPage — Pro to Team switch", () => {
  it("confirms, switches in place and polls until the row shows Team", async () => {
    const user = userEvent.setup();
    setUser({ subscription: PRO_ROW });
    vi.mocked(redirectToCheckout).mockResolvedValue({ updated: true, plan: "team" });
    refreshSubscription.mockResolvedValue({ ...PRO_ROW, plan: "team" });
    renderAt();

    await user.click(screen.getByRole("button", { name: "Upgrade to Team" }));

    // In-app dialog, not the browser's window.confirm (TODO 9.18).
    const dialog = screen.getByRole("dialog", { name: "Switch to Team?" });
    expect(dialog).toHaveTextContent("Switch to Team ($89/month)");
    expect(redirectToCheckout).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Switch to Team" }));
    expect(redirectToCheckout).toHaveBeenCalledWith("team", { confirmSwitch: true });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("You're now on Team."));
    expect(refreshSubscription).toHaveBeenCalledWith({ silent: true });
  });

  it("does nothing when the confirm is declined", async () => {
    const user = userEvent.setup();
    setUser({ subscription: PRO_ROW });
    renderAt();

    await user.click(screen.getByRole("button", { name: "Upgrade to Team" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(redirectToCheckout).not.toHaveBeenCalled();
  });

  it("shows the server's 409 message and re-reads the subscription", async () => {
    const user = userEvent.setup();
    setUser({ subscription: PRO_ROW });
    const err = Object.assign(new Error("Your last payment failed. Update your payment method under Manage subscription first."), {
      status: 409,
      code: "payment_required",
    });
    vi.mocked(redirectToCheckout).mockRejectedValue(err);
    renderAt();

    await user.click(screen.getByRole("button", { name: "Upgrade to Team" }));
    await user.click(screen.getByRole("button", { name: "Switch to Team" }));
    expect(await screen.findByText(/Your last payment failed\. Update your payment method under Manage/)).toBeInTheDocument();
    expect(refreshSubscription).toHaveBeenCalledWith({ silent: true });
  });
});

describe("BillingPage — L4 return from Stripe", () => {
  it("?success=true polls the subscription, clears the URL and reports the plan active", async () => {
    setUser({ subscription: FREE_ROW });
    refreshSubscription.mockResolvedValue({ ...PRO_ROW, status: "trialing" });
    renderAt("/billing?success=true");

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Your plan is active."));
    expect(refreshSubscription).toHaveBeenCalledWith({ silent: true });
    expect(screen.getByTestId("search")).toHaveTextContent(/^$/);
  });

  it("?success=true gives up with a warning when the webhook never lands", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setUser({ subscription: FREE_ROW });
    refreshSubscription.mockResolvedValue(FREE_ROW);
    renderAt("/billing?success=true");

    expect(screen.getByRole("status")).toHaveTextContent("Activating your plan");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(21000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("has not updated yet");
    expect(refreshSubscription).toHaveBeenCalledTimes(5);
  });

  it("?canceled=true shows a not-charged notice and does not poll", () => {
    setUser({ subscription: FREE_ROW });
    renderAt("/billing?canceled=true");

    expect(screen.getByRole("status")).toHaveTextContent("Checkout canceled. You have not been charged.");
    expect(refreshSubscription).not.toHaveBeenCalled();
    expect(screen.getByTestId("search")).toHaveTextContent(/^$/);
  });
});
