import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import useExport from "./useExport";

// Mock the export utilities — we test them separately in export.test.js
vi.mock("../utils/export", () => ({
  rowsToCsv:       vi.fn(() => "csv-data"),
  downloadCsv:     vi.fn(),
  rowsToPrintHtml: vi.fn(() => "<html>print</html>"),
  openPrintWindow: vi.fn(),
}));

import { rowsToCsv, downloadCsv, rowsToPrintHtml, openPrintWindow } from "../utils/export";

const SORTED = [
  { id: "1", name: "C-Stand",  location: "G&E Truck", status: "Available" },
  { id: "2", name: "SkyPanel", location: "Stage A",   status: "Out" },
  { id: "3", name: "Sandbag",  location: "G&E Truck", status: "Available" },
];

const VISIBLE = [...SORTED, { id: "4", name: "Extra", location: "Cage", status: "Available" }];

function render(opts = {}) {
  return renderHook(() =>
    useExport({ sortedEquipment: SORTED, visibleEquipment: VISIBLE, ...opts }),
  );
}

beforeEach(() => vi.clearAllMocks());

// ── Modal state ────────────────────────────────────────────────────────────
describe("modal state", () => {
  it("showExportModal defaults to false", () => {
    const { result } = render();
    expect(result.current.showExportModal).toBe(false);
  });

  it("setShowExportModal opens and closes modal", () => {
    const { result } = render();
    act(() => result.current.setShowExportModal(true));
    expect(result.current.showExportModal).toBe(true);
    act(() => result.current.setShowExportModal(false));
    expect(result.current.showExportModal).toBe(false);
  });
});

// ── getExportRows ─────────────────────────────────────────────────────────
describe("getExportRows", () => {
  it("scope=all + useCurrentView=true returns sortedEquipment", () => {
    const { result } = render();
    expect(result.current.getExportRows()).toEqual(SORTED);
  });

  it("scope=all + useCurrentView=false returns visibleEquipment", () => {
    const { result } = render();
    act(() => result.current.setExportUseCurrentView(false));
    expect(result.current.getExportRows()).toEqual(VISIBLE);
  });

  it("scope=single filters by exportSingleLocation", () => {
    const { result } = render();
    act(() => {
      result.current.setExportScope("single");
      result.current.setExportSingleLocation("Stage A");
    });
    const rows = result.current.getExportRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("SkyPanel");
  });

  it("scope=single with no location returns empty", () => {
    const { result } = render();
    act(() => result.current.setExportScope("single"));
    // exportSingleLocation defaults to ""
    expect(result.current.getExportRows()).toEqual([]);
  });

  it("scope=multi filters by exportMultiLocations set", () => {
    const { result } = render();
    act(() => {
      result.current.setExportScope("multi");
      result.current.setExportMultiLocations(["G&E Truck", "Stage A"]);
    });
    const rows = result.current.getExportRows();
    const names = rows.map((r) => r.name);
    expect(names).toContain("C-Stand");
    expect(names).toContain("SkyPanel");
    expect(names).toContain("Sandbag");
    expect(names).not.toContain("Extra"); // Extra is in Cage, not selected
  });

  it("scope=multi with empty array returns empty", () => {
    const { result } = render();
    act(() => result.current.setExportScope("multi"));
    expect(result.current.getExportRows()).toEqual([]);
  });
});

// ── doExport ──────────────────────────────────────────────────────────────
describe("doExport", () => {
  it("calls downloadCsv when format is csv", () => {
    const { result } = render();
    act(() => result.current.doExport());
    expect(rowsToCsv).toHaveBeenCalledWith(SORTED);
    expect(downloadCsv).toHaveBeenCalledWith("csv-data");
    expect(openPrintWindow).not.toHaveBeenCalled();
  });

  it("calls openPrintWindow when format is pdf", () => {
    const { result } = render();
    act(() => result.current.setExportFormat("pdf"));
    act(() => result.current.doExport());
    expect(rowsToPrintHtml).toHaveBeenCalledWith(SORTED, "GripTrack Export");
    expect(openPrintWindow).toHaveBeenCalled();
    expect(downloadCsv).not.toHaveBeenCalled();
  });

  it("returns count of exported rows", () => {
    const { result } = render();
    let out;
    act(() => { out = result.current.doExport(); });
    expect(out.count).toBe(SORTED.length);
  });

  it("returns count 0 and does not export when rows is empty", () => {
    const { result } = renderHook(() =>
      useExport({ sortedEquipment: [], visibleEquipment: [] }),
    );
    let out;
    act(() => { out = result.current.doExport(); });
    expect(out.count).toBe(0);
    expect(downloadCsv).not.toHaveBeenCalled();
    expect(openPrintWindow).not.toHaveBeenCalled();
  });
});
