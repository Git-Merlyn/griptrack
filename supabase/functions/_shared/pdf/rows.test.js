// @vitest-environment node
// Parser fixture tests (WP26 Phase 2, includes 9.10 part A). Runs in Vitest
// with the web suite; the edge function imports the same file.
import { describe, it, expect } from "vitest";
import { linesFromPages, parseRentalPages, pageToLines } from "./rows.js";
import { codedList, codelessList, scannedPages } from "./__fixtures__/synthetic.js";

const DATES_CODED = { startDate: "2026-11-03", endDate: "2026-11-10" };
const DATES_CODELESS = { startDate: "2026-11-03", endDate: "2026-11-12" };

describe("parseRentalPages: coded list", () => {
  const rows = parseRentalPages(codedList);

  it("reads every top-level item across pages, in order", () => {
    expect(rows).toEqual([
      { code: "GRP1001", name: "Apple Box Full", category: "", quantity: 4, ...DATES_CODED },
      { code: "GRP1002", name: "Sandbag 25lb", category: "", quantity: 10, ...DATES_CODED },
      { code: "LTE2001", name: "Tungsten Kit 650W", category: "", quantity: 1, ...DATES_CODED },
      { code: "ELC3001", name: "Stinger 25ft", category: "", quantity: 12, ...DATES_CODED },
      { code: "GRP1003", name: "Combo Stand - Steel", category: "", quantity: 6, ...DATES_CODED },
      { code: "GRP1004", name: "Furniture Pad", category: "", quantity: 20, ...DATES_CODED },
    ]);
  });

  it("drops an indented sub-item even though it has its own code", () => {
    expect(rows.map((r) => r.code)).not.toContain("LTE2002");
  });
});

describe("parseRentalPages: codeless list", () => {
  it("reads 'qty description' lines under category headings, skipping totals", () => {
    expect(parseRentalPages(codelessList)).toEqual([
      { code: "", name: "Baby Stand", category: "GRIP", quantity: 2, ...DATES_CODELESS },
      { code: "", name: "Apple Box Half", category: "GRIP", quantity: 4, ...DATES_CODELESS },
      { code: "", name: "Stinger 25ft", category: "ELECTRIC", quantity: 12, ...DATES_CODELESS },
    ]);
  });
});

describe("line grouping", () => {
  it("joins items on the same y (within 1 unit) left to right, top to bottom", () => {
    const at = (str, x, y) => ({ str, transform: [1, 0, 0, 1, x, y] });
    const lines = pageToLines([at("World", 200, 500.6), at("Hello", 40, 500), at("Below", 40, 480)], 1);
    expect(lines.map((l) => l.text)).toEqual(["Hello World", "Below"]);
  });

  it("finds nothing in a scan", () => {
    expect(parseRentalPages(scannedPages)).toEqual([]);
    expect(linesFromPages(scannedPages).map((l) => l.text)).toEqual(["1"]);
  });
});
