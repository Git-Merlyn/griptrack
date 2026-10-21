import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import useUser from "@/context/useUser";
import { redirectToCheckout } from "@/lib/stripe";
import PricingPage from "./PricingPage";

vi.mock("@/context/useUser");
vi.mock("@/lib/stripe", () => ({ redirectToCheckout: vi.fn() }));

const renderPricing = () =>
  render(
    <MemoryRouter initialEntries={["/pricing"]}>
      <Routes>
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/billing" element={<div>BILLING PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => vi.mocked(redirectToCheckout).mockReset());

describe("PricingPage", () => {
  it("M2: no annual toggle or annual prices are offered", () => {
    vi.mocked(useUser).mockReturnValue({ authUser: null, plan: "free", subscription: null });
    renderPricing();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByText(/Annual/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$32|\$74|Billed/)).not.toBeInTheDocument();
    expect(screen.getByText("$39")).toBeInTheDocument();
  });

  it("free org starts Checkout with only the plan", async () => {
    const user = userEvent.setup();
    vi.mocked(useUser).mockReturnValue({
      authUser: { id: "u1" },
      plan: "free",
      subscription: { plan: "free", status: "active" },
    });
    vi.mocked(redirectToCheckout).mockResolvedValue({ redirected: true });
    renderPricing();

    await user.click(screen.getByRole("button", { name: "Upgrade to Pro" }));
    expect(redirectToCheckout).toHaveBeenCalledWith("pro");
  });

  it("H5: a past_due Pro org is sent to /billing, not to a second Checkout", async () => {
    const user = userEvent.setup();
    vi.mocked(useUser).mockReturnValue({
      authUser: { id: "u1" },
      plan: "free", // derived plan is free while past_due
      subscription: { plan: "pro", status: "past_due" },
    });
    renderPricing();

    await user.click(screen.getByRole("button", { name: "Upgrade to Team" }));
    expect(redirectToCheckout).not.toHaveBeenCalled();
    expect(await screen.findByText("BILLING PAGE")).toBeInTheDocument();
  });

  it("H5: an active Pro org upgrading to Team goes through /billing", async () => {
    const user = userEvent.setup();
    vi.mocked(useUser).mockReturnValue({
      authUser: { id: "u1" },
      plan: "pro",
      subscription: { plan: "pro", status: "active" },
    });
    renderPricing();

    expect(screen.getAllByText("Current plan").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Upgrade to Team" }));
    expect(redirectToCheckout).not.toHaveBeenCalled();
    expect(await screen.findByText("BILLING PAGE")).toBeInTheDocument();
  });
});

describe("PricingPage plan and trial copy (audit M9, WP09)", () => {
  beforeEach(() => {
    vi.mocked(useUser).mockReturnValue({ authUser: null, plan: "free", subscription: null });
  });

  it("never promises a card-free trial", () => {
    renderPricing();
    expect(screen.queryByText(/no credit card/i)).toBeNull();
    expect(screen.queryByText(/no card/i)).toBeNull();
  });

  it("states the real Stripe trial terms", () => {
    renderPricing();
    const note = screen.getByTestId("trial-terms");
    expect(note).toHaveTextContent(/14-day free trial the first time your organization subscribes/);
    expect(note).toHaveTextContent(/A card is required to start the trial/);
    expect(note).toHaveTextContent(/charged automatically when the trial ends unless you cancel before then/);
  });

  it("still lists what the Free plan does not include", () => {
    renderPricing();
    for (const missing of ["PDF import", "Audit log", "Staff invites"]) {
      expect(screen.getByText(missing)).toBeInTheDocument();
    }
    expect(screen.getByText("Up to 50 equipment items")).toBeInTheDocument();
    expect(screen.getByText("1 active location")).toBeInTheDocument();
    expect(screen.getByText("Up to 5 staff members")).toBeInTheDocument();
  });
});
