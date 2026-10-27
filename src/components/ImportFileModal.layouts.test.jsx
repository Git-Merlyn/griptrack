// Saved supplier layouts in the import dialog (WP26 Phase 3).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import useUser from "@/context/useUser";
import EquipmentContext from "@/context/EquipmentContext";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { columnList } from "@pdf/__fixtures__/synthetic.js";
import { itemLines } from "@pdf/templates.js";
import { buildTemplate } from "@/lib/teachLayout";
import ImportFileModal from "./ImportFileModal";

const h = vi.hoisted(() => ({ layouts: [], rpc: vi.fn() }));
vi.mock("@/context/useUser");
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: h.layouts, error: null }) }),
    rpc: (...a) => (h.rpc(...a), Promise.resolve({ data: null, error: null })),
  },
}));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }));
vi.mock("pdfjs-dist/legacy/build/pdf.worker.mjs?url", () => ({ default: "worker.js" }));

const NO = [];
const ctx = { pdfParsingStatus: "idle", setPdfParsingStatus: vi.fn(), registerLocation: vi.fn() };
const taught = buildTemplate(columnList, {
  headerIndex: 2,
  nameColumn: 0,
  quantityColumn: 2,
  categoryColumn: 1,
  categoryFrom: "column",
  skipIndexes: [itemLines(columnList)[0].length - 1],
}).template;

function open(onUpload = vi.fn().mockResolvedValue()) {
  vi.mocked(pdfjs.getDocument).mockReturnValue({
    promise: Promise.resolve({
      numPages: columnList.length,
      getPage: async (n) => ({ getTextContent: async () => ({ items: columnList[n - 1] }) }),
    }),
  });
  vi.mocked(useUser).mockReturnValue({ effectivePlan: "pro", orgId: "org-1" });
  const view = render(
    <EquipmentContext.Provider value={ctx}>
      <ImportFileModal isOpen onClose={vi.fn()} onUpload={onUpload} allLocations={NO} mode="select" />
    </EquipmentContext.Provider>,
  );
  fireEvent.change(view.container.ownerDocument.querySelector('input[type="file"]'), {
    target: { files: [new File(["%PDF"], "cascade.pdf", { type: "application/pdf" })] },
  });
  return onUpload;
}

beforeEach(() => {
  h.layouts = [];
  h.rpc.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("ImportFileModal saved layouts", () => {
  it("uses a saved layout for this supplier, says so, and counts the import", async () => {
    h.layouts = [{ id: "t1", name: "Cascade", scope: "org", template: taught, success_count: 0 }];
    const onUpload = open();
    expect(await screen.findByTestId("layout-banner")).toHaveTextContent('Read with your saved layout "Cascade".');
    expect(screen.getByLabelText("Category, row 1")).toHaveValue("Boxes");
    expect(screen.getByLabelText("Description, row 4")).toHaveValue("Furniture Pad");

    fireEvent.click(screen.getByRole("button", { name: "Apply Selection" }));
    await waitFor(() => expect(onUpload).toHaveBeenCalled());
    expect(h.rpc).toHaveBeenCalledWith("record_pdf_template_use", { p_template: "t1", p_ok: true });
  });

  it("falls back to the general reader and offers to teach the layout", async () => {
    open();
    const banner = await screen.findByTestId("layout-banner");
    expect(banner).toHaveTextContent("Read with the general reader.");
    fireEvent.click(screen.getByRole("button", { name: "Rows look wrong? Teach GripTrack this layout" }));
    expect(await screen.findByRole("dialog", { name: "Teach GripTrack this supplier's layout" })).toBeInTheDocument();
  });

  it("warns when a saved layout no longer fits", async () => {
    const moved = { ...taught, columns: { ...taught.columns, quantity: { x_min: 600, x_max: 700 } } };
    h.layouts = [{ id: "t1", name: "Cascade", scope: "org", template: moved, success_count: 3 }];
    open();
    expect(await screen.findByTestId("layout-banner")).toHaveTextContent("layout seems to have changed");
    expect(screen.getByRole("button", { name: "Teach it again" })).toBeInTheDocument();
  });
});
