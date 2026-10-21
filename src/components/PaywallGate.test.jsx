import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import useUser from "@/context/useUser";
import PaywallGate from "./PaywallGate";

vi.mock("@/context/useUser");

const renderGate = (user, requiredPlan = "pro") => {
  vi.mocked(useUser).mockReturnValue({ loadingSubscription: false, ...user });
  return render(
    <MemoryRouter>
      <PaywallGate requiredPlan={requiredPlan} featureName="Staff invites">
        <div>secret feature</div>
      </PaywallGate>
    </MemoryRouter>,
  );
};

describe("PaywallGate", () => {
  beforeEach(() => vi.mocked(useUser).mockReset());

  it("renders children when the effective plan meets the requirement", () => {
    renderGate({ effectivePlan: "pro", role: "crew" });
    expect(screen.getByText("secret feature")).toBeInTheDocument();
  });

  it("renders children for team when pro is required", () => {
    renderGate({ effectivePlan: "team", role: "crew" });
    expect(screen.getByText("secret feature")).toBeInTheDocument();
  });

  it("gates on effectivePlan, not on the org's trial_ends_at", () => {
    renderGate({
      effectivePlan: "free",
      plan: "free",
      role: "owner",
      trialEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(screen.queryByText("secret feature")).toBeNull();
  });

  it("shows the owner an upgrade link on free", () => {
    renderGate({ effectivePlan: "free", role: "owner" });
    expect(screen.queryByText("secret feature")).toBeNull();
    expect(screen.getByText("Staff invites is a Pro feature")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View plans" })).toHaveAttribute("href", "/pricing");
  });

  it("tells non-owners to ask the owner, with no upgrade link", () => {
    renderGate({ effectivePlan: "free", role: "admin" });
    expect(screen.queryByText("secret feature")).toBeNull();
    expect(screen.getByText(/Ask your organization's owner to upgrade/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View plans" })).toBeNull();
  });

  it("blocks pro when team is required", () => {
    renderGate({ effectivePlan: "pro", role: "owner" }, "team");
    expect(screen.getByText("Staff invites is a Team feature")).toBeInTheDocument();
  });

  it("renders nothing while the subscription is loading", () => {
    vi.mocked(useUser).mockReturnValue({ loadingSubscription: true, effectivePlan: "free", role: "owner" });
    const { container } = render(
      <MemoryRouter>
        <PaywallGate featureName="X"><div>secret feature</div></PaywallGate>
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
