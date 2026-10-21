import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { insert, from } = vi.hoisted(() => {
  const insert = vi.fn();
  return { insert, from: vi.fn(() => ({ insert })) };
});
vi.mock("@/lib/supabaseClient", () => ({ supabase: { from } }));

import ErrorBoundary from "./ErrorBoundary";
import { getToasts, resetToastsForTests } from "@/lib/toast";

function Boom() {
  throw new Error("kaboom");
}

function openAndSubmit(text) {
  render(
    <ErrorBoundary>
      <Boom />
    </ErrorBoundary>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Report this issue" }));
  fireEvent.change(screen.getByPlaceholderText("What happened / what do you want?"), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
}

beforeEach(() => {
  insert.mockReset();
  from.mockClear();
  resetToastsForTests();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("ErrorBoundary 'Report this issue'", () => {
  it("sends the report even though UserProvider is not mounted", async () => {
    insert.mockResolvedValue({ error: null });
    openAndSubmit("Dashboard crashed after a move");

    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    expect(from).toHaveBeenCalledWith("beta_feedback");
    expect(insert.mock.calls[0][0][0]).toMatchObject({
      type: "bug",
      description: "Dashboard crashed after a move",
    });
    expect(insert.mock.calls[0][0][0]).not.toHaveProperty("org_id");
    await waitFor(() =>
      expect(getToasts().map((t) => t.message)).toContain("Feedback submitted — thank you!"),
    );
  });

  it("explains a signed-out RLS rejection", async () => {
    insert.mockResolvedValue({ error: { code: "42501", message: "new row violates row-level security policy" } });
    openAndSubmit("crash on landing page");

    await waitFor(() =>
      expect(getToasts().map((t) => t.message)).toContain("Please sign in to send feedback."),
    );
  });
});
