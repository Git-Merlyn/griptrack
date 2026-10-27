// "Teach it" dialog (WP26 Phase 3): pick headings, map columns, preview, save.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { columnList } from "@pdf/__fixtures__/synthetic.js";

const h = vi.hoisted(() => ({ insert: vi.fn(), update: vi.fn(), result: null }));
vi.mock("@/context/useUser", () => ({ default: () => ({ orgId: "org-1" }) }));
vi.mock("@/lib/supabaseClient", () => {
  const chain = () => {
    const q = {};
    q.eq = () => q;
    q.select = () => q;
    q.maybeSingle = async () => h.result;
    return q;
  };
  return {
    supabase: {
      from: () => ({
        insert: (row) => (h.insert(row), chain()),
        update: (row) => (h.update(row), chain()),
      }),
    },
  };
});

import TeachLayoutDialog from "./TeachLayoutDialog";

function renderDialog(props = {}) {
  const onSaved = vi.fn();
  render(<TeachLayoutDialog isOpen pages={columnList} onClose={vi.fn()} onSaved={onSaved} {...props} />);
  return { onSaved };
}

function teach() {
  fireEvent.click(screen.getByTestId("teach-line-2")); // the headings line
  fireEvent.change(screen.getByLabelText("Item name column"), { target: { value: "0" } });
  fireEvent.change(screen.getByLabelText("Quantity column"), { target: { value: "2" } });
}

beforeEach(() => {
  h.insert.mockReset();
  h.update.mockReset();
  h.result = { data: { id: "t1", name: "CASCADE STUDIO RENTALS", scope: "org", template: {} }, error: null };
});

describe("TeachLayoutDialog", () => {
  it("cannot save until name and quantity columns give rows", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Save layout" })).toBeDisabled();
    fireEvent.click(screen.getByTestId("teach-line-2"));
    expect(screen.getByRole("button", { name: "Save layout" })).toBeDisabled();
  });

  it("previews the rows as columns are chosen", () => {
    renderDialog();
    teach();
    // Without a skip, "Subtotal 24" has no quantity cell and is ignored anyway.
    expect(screen.getByText("4 items found")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Preview" })).toHaveTextContent("Apple Box Full");
  });

  it("saves a new org layout and hands it back", async () => {
    const { onSaved } = renderDialog();
    teach();
    fireEvent.click(screen.getByRole("button", { name: "Save layout" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const row = h.insert.mock.calls[0][0];
    expect(row).toMatchObject({ org_id: "org-1", name: "CASCADE STUDIO RENTALS" });
    expect(row.template.columns.name).toEqual({ x_min: 0, x_max: 213 });
    expect(h.update).not.toHaveBeenCalled();
  });

  it("re-teaching updates the existing org layout", async () => {
    const { onSaved } = renderDialog({ existing: { id: "t9", name: "Cascade", scope: "org" } });
    teach();
    fireEvent.click(screen.getByRole("button", { name: "Save layout" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(h.update).toHaveBeenCalledWith(expect.objectContaining({ name: "Cascade" }));
    expect(h.insert).not.toHaveBeenCalled();
  });

  it("explains a refused save", async () => {
    h.result = { data: null, error: { code: "23505", message: "duplicate" } };
    renderDialog();
    teach();
    fireEvent.click(screen.getByRole("button", { name: "Save layout" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You already have a layout with this name");
  });
});
