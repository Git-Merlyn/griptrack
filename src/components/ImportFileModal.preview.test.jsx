// Editable import preview and scanned-PDF detection (WP26 Phase 1, TODO 9.21).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import useUser from "@/context/useUser";
import EquipmentContext from "@/context/EquipmentContext";
import { SCANNED_PDF_MESSAGE } from "@/lib/importRows";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import ImportFileModal from "./ImportFileModal";

vi.mock("@/context/useUser");
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }));
vi.mock("pdfjs-dist/legacy/build/pdf.worker.mjs?url", () => ({ default: "worker.js" }));

const NO_LOCATIONS = [];
const ctx = { pdfParsingStatus: "idle", setPdfParsingStatus: vi.fn(), registerLocation: vi.fn() };

function renderModal(onUpload = vi.fn().mockResolvedValue(undefined)) {
  vi.mocked(useUser).mockReturnValue({ effectivePlan: "pro" });
  const view = render(
    <EquipmentContext.Provider value={ctx}>
      <ImportFileModal isOpen onClose={vi.fn()} onUpload={onUpload} allLocations={NO_LOCATIONS} mode="select" />
    </EquipmentContext.Provider>,
  );
  const input = view.container.ownerDocument.querySelector('input[type="file"]');
  return { ...view, input, onUpload };
}

const csv = (body) => new File([body], "list.csv", { type: "text/csv" });
const CSV = "Category,Name,Quantity\nGrip,Apple Box,4\nGrip,Sandbag,10\n";

async function loadRows(input) {
  fireEvent.change(input, { target: { files: [csv(CSV)] } });
  await screen.findByLabelText("Description, row 1");
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("ImportFileModal editable preview", () => {
  it("lets the user correct name, category and quantity before import", async () => {
    const { input, onUpload } = renderModal();
    await loadRows(input);

    fireEvent.change(screen.getByLabelText("Description, row 1"), { target: { value: "Apple Box Full" } });
    fireEvent.change(screen.getByLabelText("Category, row 1"), { target: { value: "Grip Kit" } });
    fireEvent.change(screen.getByLabelText("Quantity, row 1"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply Selection" }));

    await waitFor(() => expect(onUpload).toHaveBeenCalled());
    const rows = onUpload.mock.calls[0][0];
    expect(rows[0]).toMatchObject({ name: "Apple Box Full", category: "Grip Kit", quantity: 6 });
    expect(rows[0]).not.toHaveProperty("_rowKey");
  });

  it("keeps focus-stable rows while typing (no remount per keystroke)", async () => {
    const { input } = renderModal();
    await loadRows(input);
    const field = screen.getByLabelText("Description, row 1");
    fireEvent.change(field, { target: { value: "Apple Box Half" } });
    expect(screen.getByLabelText("Description, row 1")).toBe(field);
  });

  it("deletes a row", async () => {
    const { input, onUpload } = renderModal();
    await loadRows(input);
    fireEvent.click(screen.getByRole("button", { name: "Delete row 1" }));
    expect(screen.getByLabelText("Description, row 1")).toHaveValue("Sandbag");
    fireEvent.click(screen.getByRole("button", { name: "Apply Selection" }));
    await waitFor(() => expect(onUpload).toHaveBeenCalled());
    expect(onUpload.mock.calls[0][0]).toHaveLength(1);
  });

  it("adds a row by hand, and refuses to import it until it has a description", async () => {
    const { input, onUpload } = renderModal();
    await loadRows(input);
    fireEvent.click(screen.getByRole("button", { name: "+ Add row" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply Selection" }));

    expect(await screen.findByText(/Row 3: add a description or delete the row\./)).toBeInTheDocument();
    expect(screen.getByTestId("import-row-2")).toHaveClass("bg-danger/10");
    expect(onUpload).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Description, row 3"), { target: { value: "Wedge" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply Selection" }));
    await waitFor(() => expect(onUpload).toHaveBeenCalled());
    expect(onUpload.mock.calls[0][0][2]).toMatchObject({ name: "Wedge", quantity: 1 });
  });

  it("refuses a quantity under 1", async () => {
    const { input, onUpload } = renderModal();
    await loadRows(input);
    fireEvent.change(screen.getByLabelText("Quantity, row 2"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply Selection" }));
    expect(await screen.findByText(/Row 2: quantity must be a whole number of 1 or more\./)).toBeInTheDocument();
    expect(onUpload).not.toHaveBeenCalled();
  });
});

describe("ImportFileModal scanned PDF", () => {
  const pdfFile = () => new File(["%PDF-1.4"], "scan.pdf", { type: "application/pdf" });
  const docWith = (pages) => ({
    promise: Promise.resolve({
      numPages: pages.length,
      getPage: async (n) => ({ getTextContent: async () => ({ items: pages[n - 1] }) }),
    }),
  });

  it("says a PDF with no text is a scan", async () => {
    vi.mocked(pdfjs.getDocument).mockReturnValue(docWith([[], []]));
    const { input } = renderModal();
    fireEvent.change(input, { target: { files: [pdfFile()] } });
    expect(await screen.findByText(SCANNED_PDF_MESSAGE)).toBeInTheDocument();
  });

  it("treats a stray page number as no text", async () => {
    vi.mocked(pdfjs.getDocument).mockReturnValue(docWith([[{ str: "1", transform: [1, 0, 0, 1, 300, 20] }]]));
    const { input } = renderModal();
    fireEvent.change(input, { target: { files: [pdfFile()] } });
    expect(await screen.findByText(SCANNED_PDF_MESSAGE)).toBeInTheDocument();
  });

  it("does not call a PDF with text a scan", async () => {
    const line = (str, y) => ({ str, transform: [1, 0, 0, 1, 50, y] });
    vi.mocked(pdfjs.getDocument).mockReturnValue(
      docWith([[line("RENTAL ORDER FOR PRODUCTION", 700), line("Some terms and conditions apply", 680)]]),
    );
    const { input } = renderModal();
    fireEvent.change(input, { target: { files: [pdfFile()] } });
    expect(await screen.findByText(/No items found in PDF/)).toBeInTheDocument();
    expect(screen.queryByText(SCANNED_PDF_MESSAGE)).toBeNull();
  });
});
