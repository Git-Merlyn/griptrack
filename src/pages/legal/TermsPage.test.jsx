import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TermsPage from "./TermsPage";

describe("TermsPage billing terms (audit M9, WP09)", () => {
  it("describes the Free limits and the card-required Stripe trial", () => {
    render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/as described at signup/)).toBeNull();
    expect(screen.queryByText(/no credit card/i)).toBeNull();
    expect(screen.getByText(/A payment card is required to start the trial/)).toBeInTheDocument();
    expect(screen.getByText(/up to 50 equipment items and 1 active location/)).toBeInTheDocument();
  });
});
