import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import useUser from "@/context/useUser";
import EquipmentContext from "@/context/EquipmentContext";
import { PDF_IMPORT_PRO_MESSAGE } from "@/lib/plan";
import ImportFileModal from "./ImportFileModal";

vi.mock("@/context/useUser");
// EquipmentContext imports the real client, which needs .env; the modal never calls it.
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));
// Keep pdf.js out of jsdom: getDocument rejects, so a permitted PDF ends in
// the modal's own "error reading the PDF" message.
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(() => ({ promise: Promise.reject(new Error("no pdf in jsdom")) })),
}));
vi.mock("pdfjs-dist/build/pdf.worker?url", () => ({ default: "worker.js" }));

// Stable array: the modal's `allLocations = []` default is a fresh array each
// render and re-runs its sync effect forever (WP15 fixes that default).
const NO_LOCATIONS = [];

const ctx = { pdfParsingStatus: "idle", setPdfParsingStatus: vi.fn(), registerLocation: vi.fn() };

const renderModal = (effectivePlan, mode = "import") => {
  vi.mocked(useUser).mockReturnValue({ effectivePlan });
  const view = render(
    <EquipmentContext.Provider value={ctx}>
      <ImportFileModal
        isOpen
        onClose={vi.fn()}
        onUpload={vi.fn()}
        allLocations={NO_LOCATIONS}
        mode={mode}
      />
    </EquipmentContext.Provider>,
  );
  const input = view.container.ownerDocument.querySelector('input[type="file"]');
  return { ...view, input };
};

const pdf = () => new File(["%PDF-1.4"], "list.pdf", { type: "application/pdf" });

describe("ImportFileModal plan gate (audit M9)", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));

  it("blocks a PDF import on Free with the web upgrade message", () => {
    const { input } = renderModal("free");
    fireEvent.change(input, { target: { files: [pdf()] } });
    expect(screen.getByText(PDF_IMPORT_PRO_MESSAGE)).toBeInTheDocument();
  });

  it("lets Pro parse a PDF", async () => {
    const { input } = renderModal("pro");
    fireEvent.change(input, { target: { files: [pdf()] } });
    await waitFor(() =>
      expect(screen.getByText(/There was an error reading the PDF/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(PDF_IMPORT_PRO_MESSAGE)).toBeNull();
  });

  it("does not gate CSV on Free", async () => {
    const { input } = renderModal("free");
    const csv = new File(["Name\nC-Stand\n"], "list.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [csv] } });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(PDF_IMPORT_PRO_MESSAGE)).toBeNull();
  });

  it("does not gate select-from-file on Free", async () => {
    const { input } = renderModal("free", "select");
    fireEvent.change(input, { target: { files: [pdf()] } });
    await waitFor(() =>
      expect(screen.getByText(/There was an error reading the PDF/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(PDF_IMPORT_PRO_MESSAGE)).toBeNull();
  });
});
