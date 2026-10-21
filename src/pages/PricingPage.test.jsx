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
