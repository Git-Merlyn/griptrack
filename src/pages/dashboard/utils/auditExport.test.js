import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { auditToCsv } from "./auditExport";

describe("auditExport.js — auditToCsv", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-04T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Rows with null "at" avoid locale-specific comma formatting in the timestamp
  // so we can safely split on commas to inspect column values.
  const makeSimpleRow = (overrides = {}) => ({
    equipment_id: "eq-1",
    at: null,               // → empty first cell, no commas in timestamp
    action: "move",
    actor: "alice",
    from_location: "A",
    to_location: "B",
    delta_qty: null,
    meta: null,
    ...overrides,
  });

  const nameMap = { "eq-1": "C-Stand", "eq-2": "Apple Box" };

  it("starts with UTF-8 BOM", () => {
    const csv = auditToCsv([], {});
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("has all required header columns", () => {
    const csv = auditToCsv([], {});
    const header = csv.replace("﻿", "").split("\n")[0];
    ["Date / Time", "Action", "Item Name", "Item ID", "Actor",
     "From Location", "To Location", "Qty Change", "Notes"].forEach((col) => {
      expect(header).toContain(col);
    });
  });

  it("resolves item names from nameMap", () => {
    const csv = auditToCsv([
      makeSimpleRow({ equipment_id: "eq-1" }),
      makeSimpleRow({ equipment_id: "eq-2" }),
    ], nameMap);
    expect(csv).toContain("C-Stand");
    expect(csv).toContain("Apple Box");
  });

  it("leaves item name blank when equipment_id not in nameMap", () => {
    const csv = auditToCsv([makeSimpleRow({ equipment_id: "eq-1" })], {});
    expect(csv).not.toContain("C-Stand");
    const lines = csv.replace("﻿", "").split("\n");
    // With null timestamp: ,move,,eq-1,alice,A,B,,
    const cells = lines[1].split(",");
    expect(cells[2]).toBe(""); // Item Name column is index 2
  });

  it("outputs delta_qty value when present", () => {
    const csv = auditToCsv([makeSimpleRow({ delta_qty: -2 })], {});
    const lines = csv.replace("﻿", "").split("\n");
    const cells = lines[1].split(",");
    expect(cells[7]).toBe("-2"); // Qty Change column is index 7
  });

  it("leaves Qty Change cell empty when delta_qty is null", () => {
    const csv = auditToCsv([makeSimpleRow({ delta_qty: null })], {});
    const lines = csv.replace("﻿", "").split("\n");
    const cells = lines[1].split(",");
    expect(cells[7]).toBe(""); // Qty Change column is index 7
  });

  it("serializes object meta as JSON", () => {
    const csv = auditToCsv([makeSimpleRow({ meta: { note: "lost two" } })], {});
    expect(csv).toContain("lost two");
  });

  it("passes through string meta as-is", () => {
    const csv = auditToCsv([makeSimpleRow({ meta: "some note" })], {});
    expect(csv).toContain("some note");
  });

  it("handles empty rows array (header only)", () => {
    const csv = auditToCsv([], {});
    const lines = csv.replace("﻿", "").split("\n");
    expect(lines).toHaveLength(1);
  });

  it("handles invalid timestamp without throwing", () => {
    expect(() => auditToCsv([makeSimpleRow({ at: "not-a-date" })], {})).not.toThrow();
  });

  it("falls back to raw string for unparseable timestamps", () => {
    const csv = auditToCsv([makeSimpleRow({ at: "BAD_TS" })], {});
    expect(csv).toContain("BAD_TS");
  });

  it("produces one data row per input row", () => {
    const csv = auditToCsv([makeSimpleRow(), makeSimpleRow()], {});
    const lines = csv.replace("﻿", "").split("\n");
    expect(lines).toHaveLength(3); // header + 2
  });
});
