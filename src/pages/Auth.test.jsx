import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { signUp } = vi.hoisted(() => ({ signUp: vi.fn() }));
vi.mock("@/lib/supabaseClient", () => ({ supabase: { auth: { signUp } } }));

import Auth from "./Auth";

const renderAt = (url, mode = "normal") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Auth mode={mode} />
    </MemoryRouter>,
  );

function fillSignUp(container) {
  const [name, email] = container.querySelectorAll("input[type=text], input[type=email]");
  fireEvent.change(name, { target: { value: "Pat Grip" } });
  fireEvent.change(email, { target: { value: "pat@example.test" } });
  fireEvent.change(container.querySelector("input[type=password]"), {
    target: { value: "longenough" },
  });
}

describe("Auth ?mode= (M10)", () => {
  it("opens the sign-up form for /auth?mode=signup", async () => {
    renderAt("/auth?mode=signup");
    expect(await screen.findByRole("button", { name: "Sign up" })).toBeInTheDocument();
    expect(screen.getByText("Full name")).toBeInTheDocument();
  });

  it("defaults to sign-in for plain /auth", () => {
    renderAt("/auth");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText("Full name")).not.toBeInTheDocument();
  });

  it("ignores unknown modes", () => {
    renderAt("/auth?mode=forgot");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });
});

describe("Auth sign-up role (WP25)", () => {
  it("asks whether you run a team or work on one, and requires an answer", async () => {
    signUp.mockReset();
    const { container } = renderAt("/auth?mode=signup");
    await screen.findByRole("button", { name: "Sign up" });
    expect(screen.getByRole("button", { name: /I run a team/ })).toHaveAttribute("aria-pressed", "false");
    fillSignUp(container);
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(await screen.findByText("Choose whether you run a team or work on one")).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("sends the chosen role with the sign-up metadata", async () => {
    signUp.mockReset().mockResolvedValue({ data: { session: null }, error: null });
    const { container } = renderAt("/auth?mode=signup");
    await screen.findByRole("button", { name: "Sign up" });
    fireEvent.click(screen.getByRole("button", { name: /I work on a team/ }));
    expect(screen.getByRole("button", { name: /I work on a team/ })).toHaveAttribute("aria-pressed", "true");
    fillSignUp(container);
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    await waitFor(() => expect(signUp).toHaveBeenCalled());
    expect(signUp.mock.calls[0][0].options.data).toEqual({ full_name: "Pat Grip", signup_role: "crew" });
  });

  it("does not ask on an invite link and signs up as crew", async () => {
    signUp.mockReset().mockResolvedValue({ data: { session: null }, error: null });
    const { container } = renderAt("/invite?mode=signup", "invite");
    await screen.findByRole("button", { name: "Sign up" });
    expect(screen.queryByRole("button", { name: /I run a team/ })).not.toBeInTheDocument();
    fillSignUp(container);
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    await waitFor(() => expect(signUp).toHaveBeenCalled());
    expect(signUp.mock.calls[0][0].options.data.signup_role).toBe("crew");
  });
});
