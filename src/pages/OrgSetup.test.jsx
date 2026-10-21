import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { from, useUserMock } = vi.hoisted(() => ({ from: vi.fn(), useUserMock: vi.fn() }));
vi.mock("@/lib/supabaseClient", () => ({ supabase: { from } }));
vi.mock("@/context/useUser", () => ({ default: useUserMock }));

import OrgSetup from "./OrgSetup";

function query(result) {
  const q = {};
  for (const m of ["update", "eq", "select"]) q[m] = vi.fn(() => q);
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
}

const applyOrgName = vi.fn();
const base = { orgId: "org-1", orgName: "New Company", role: "owner", applyOrgName, logout: vi.fn() };

function renderWith(overrides = {}) {
  useUserMock.mockReturnValue({ ...base, ...overrides });
  render(
    <MemoryRouter>
      <OrgSetup />
    </MemoryRouter>,
  );
}

function submit(name) {
  fireEvent.change(screen.getByLabelText("Company name"), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: "Save & Continue" }));
}

beforeEach(() => {
  from.mockReset();
  applyOrgName.mockReset();
});

describe("OrgSetup (L2)", () => {
  it("does not prefill a placeholder name", () => {
    renderWith();
    expect(screen.getByLabelText("Company name")).toHaveValue("");
  });

  it("rejects placeholder names without calling the server", () => {
    renderWith();
    submit("company");
    expect(screen.getByText('"company" is a placeholder. Enter your real company name.')).toBeInTheDocument();
    expect(from).not.toHaveBeenCalled();
  });

  it("reports an RLS-filtered 0-row UPDATE instead of continuing", async () => {
    from.mockReturnValueOnce(query({ data: [], error: null }));
    renderWith();
    submit("Polaris Grip");
    expect(
      await screen.findByText("Only the organization owner can set the company name."),
    ).toBeInTheDocument();
    expect(applyOrgName).not.toHaveBeenCalled();
  });

  it("hands the saved name to the provider on success", async () => {
    from.mockReturnValueOnce(query({ data: [{ id: "org-1", name: "Polaris Grip" }], error: null }));
    renderWith();
    submit("Polaris Grip");
    await waitFor(() => expect(applyOrgName).toHaveBeenCalledWith("Polaris Grip"));
  });

  it("shows non-owners an explanation instead of the form", () => {
    renderWith({ role: "admin" });
    expect(screen.queryByLabelText("Company name")).toBeNull();
    expect(screen.getByText(/owner needs to set the company name/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });
});
