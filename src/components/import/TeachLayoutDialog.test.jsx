// "Teach it" dialog (WP26 Phase 3): pick headings, map columns, preview, save.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { columnList } from "@pdf/__fixtures__/synthetic.js";

const h = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  result: null,
  plan: "free",
  invoke: vi.fn(),
  rpc: vi.fn(),
  consentAt: null,
}));
vi.mock("@/context/useUser", () => ({
  default: () => ({ orgId: "org-1", effectivePlan: h.plan, authUser: { id: "u1" } }),
}));
vi.mock("@/lib/invokeFn", () => ({ invokeFn: (...a) => h.invoke(...a) }));
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
        // profiles: has this account agreed to "Set up this layout for me"?
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { layout_setup_consent_at: h.consentAt }, error: null }) }),
        }),
      }),
      rpc: async (...a) => (h.rpc(...a), { data: "2026-10-27T00:00:00Z", error: null }),
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
  h.plan = "free";
  h.consentAt = null;
  h.rpc.mockReset();
  h.invoke.mockReset();
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

describe("TeachLayoutDialog: Set up this layout for me (WP26 Phase 4)", () => {
  const suggested = {
    headerIndex: 2,
    nameColumn: 0,
    quantityColumn: 2,
    categoryColumn: 1,
    codeColumn: -1,
    categoryFrom: "column",
    endIndex: -1,
    skipIndexes: [8],
  };

  it("is not offered on the Free plan", () => {
    renderDialog();
    expect(screen.queryByRole("button", { name: "Set up this layout for me" })).toBeNull();
  });

  it("says what is sent and to whom before sending anything", async () => {
    h.plan = "pro";
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Set up this layout for me" }));
    const dialog = await screen.findByRole("dialog", { name: "Set up this layout for you?" });
    expect(dialog).toHaveTextContent("first two pages of this PDF to Anthropic, an outside service");
    expect(dialog).toHaveTextContent("The file itself isn't sent.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Set up this layout for you?" })).toBeNull());
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it("asks once, records the agreement, then fills in the suggested layout", async () => {
    h.plan = "team";
    h.invoke.mockResolvedValue({ choice: suggested, rows: 4 });
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Set up this layout for me" }));
    fireEvent.click(await screen.findByRole("button", { name: "Set it up" }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith("record_layout_setup_consent"));

    expect(await screen.findByText(/Here's the suggested layout/)).toBeInTheDocument();
    const [name, args] = h.invoke.mock.calls[0];
    expect(name).toBe("build-pdf-template");
    expect(args.body.pages).toHaveLength(2);
    expect(args.body.pages[0][0]).toEqual({ str: "CASCADE STUDIO RENTALS", transform: [1, 0, 0, 1, 40, 760], width: 160 });
    expect(screen.getByLabelText("Item name column")).toHaveValue("0");
    expect(screen.getByLabelText("Quantity column")).toHaveValue("2");
    expect(screen.getByText("4 items found")).toBeInTheDocument();
    // Nothing is saved until the user saves.
    expect(h.insert).not.toHaveBeenCalled();
  });

  it("shows the server's message when it cannot help (e.g. the daily limit)", async () => {
    h.plan = "pro";
    h.invoke.mockRejectedValue(new Error("Your organization has used today's 5 layout setups."));
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Set up this layout for me" }));
    fireEvent.click(await screen.findByRole("button", { name: "Set it up" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("used today's 5 layout setups");
  });

  it("does not ask again once the account has agreed", async () => {
    h.plan = "pro";
    h.consentAt = "2026-10-27T00:00:00Z";
    h.invoke.mockResolvedValue({ choice: suggested, rows: 4 });
    renderDialog();
    // Let the profile lookup land before pressing the button.
    await waitFor(() => expect(screen.getByTestId("setup-reminder")).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.click(screen.getByRole("button", { name: "Set up this layout for me" }));
    expect(await screen.findByText(/Here's the suggested layout/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Set up this layout for you?" })).toBeNull();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("always shows the reminder of what is sent and to whom", () => {
    h.plan = "pro";
    renderDialog();
    expect(screen.getByTestId("setup-reminder")).toHaveTextContent(
      "Sends the text of the first two pages to Anthropic. Every item still comes from the PDF.",
    );
  });
});
