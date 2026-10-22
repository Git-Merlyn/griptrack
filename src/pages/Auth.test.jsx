import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/supabaseClient", () => ({ supabase: { auth: {} } }));

import Auth from "./Auth";

const renderAt = (url) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Auth mode="normal" />
    </MemoryRouter>,
  );

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
