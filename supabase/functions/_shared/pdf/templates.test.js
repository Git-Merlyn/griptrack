// @vitest-environment node
// Supplier templates (WP26 Phase 3): fingerprint, matching, headings to
// column ranges, validation and apply. Synthetic fixtures only.
import { describe, it, expect } from "vitest";
import {
  applyTemplate,
  fingerprintFor,
  headingsFromLine,
  itemLines,
  markerKey,
  matchTemplate,
  validateTemplate,
} from "./templates.js";
import { codedList, columnList } from "./__fixtures__/synthetic.js";

const headerLine = itemLines(columnList)[0][2]; // "Item Description Category Qty"
const headings = headingsFromLine(headerLine);
const col = (label) => headings.find((h) => h.label === label).range;

const template = (over = {}) => ({
  version: 1,
  fingerprint: fingerprintFor("Item Description Category Qty", "CASCADE STUDIO RENTALS"),
  table: { start_after: "Item Description Category Qty", end_before: "Total items" },
  columns: { name: col("Item Description"), quantity: col("Qty"), category: col("Category") },
  skip: ["Subtotal"],
  category_from: "column",
  ...over,
});

describe("headingsFromLine", () => {
  it("joins words of one heading and splits columns at the midpoints", () => {
    expect(headings.map((h) => h.label)).toEqual(["Item Description", "Category", "Qty"]);
    expect(col("Item Description")).toEqual({ x_min: 0, x_max: 213 });
    expect(col("Qty").x_max).toBe(100000);
  });
});

describe("markers", () => {
  it("compare on letters only, upper case, first three words", () => {
    expect(markerKey("Total items: 44")).toBe("TOTAL ITEMS");
    expect(markerKey("Subtotal 24 (incl. tax)")).toBe("SUBTOTAL INCL TAX");
  });
});

describe("matchTemplate", () => {
  const rec = (t, success_count = 0) => ({ template: t, success_count });

  it("matches when every fingerprint word is on page 1", () => {
    const t = template();
    expect(t.fingerprint.tokens).toEqual(["CASCADE", "STUDIO", "RENTALS", "ITEM", "DESCRIPTION", "CATEGORY", "QTY"]);
    expect(matchTemplate([rec(t)], columnList)?.template).toBe(t);
  });

  it("does not match another supplier's PDF", () => {
    expect(matchTemplate([rec(template())], codedList)).toBeNull();
  });

  it("prefers the more specific template, then the more successful one", () => {
    const generic = template({ fingerprint: { tokens: ["ITEM", "QTY"] } });
    const specific = template();
    expect(matchTemplate([rec(generic, 50), rec(specific, 0)], columnList)?.template).toBe(specific);
    const twinA = template();
    const twinB = template();
    expect(matchTemplate([rec(twinA, 1), rec(twinB, 9)], columnList)?.template).toBe(twinB);
  });
});

describe("applyTemplate", () => {
  const DATES = { startDate: "2027-03-02", endDate: "2027-03-09" };

  it("reads the columns across pages, skips subtotals and stops at the total", () => {
    const { rows, drift } = applyTemplate(template(), columnList);
    expect(rows).toEqual([
      { code: "", name: "Apple Box Full", category: "Boxes", quantity: 4, ...DATES },
      { code: "", name: "Sandbag 25lb", category: "Weights", quantity: 12, ...DATES },
      { code: "", name: "Stinger 25ft", category: "Cable", quantity: 8, ...DATES },
      { code: "", name: "Furniture Pad", category: "Blankets", quantity: 20, ...DATES },
    ]);
    expect(drift).toBe(false);
  });

  it("can take the category from section headings instead", () => {
    const { rows } = applyTemplate(template({ category_from: "heading" }), columnList);
    expect(rows.map((r) => `${r.category}: ${r.name}`)).toEqual([
      "Grip: Apple Box Full",
      "Grip: Sandbag 25lb",
      "Electric: Stinger 25ft",
      // Page 2 repeats the supplier name above the table, which becomes the heading.
      "CASCADE STUDIO RENTALS: Furniture Pad",
    ]);
  });

  it("flags drift when the layout no longer fits", () => {
    const moved = template({ columns: { name: col("Item Description"), quantity: { x_min: 600, x_max: 700 } } , category_from: "none" });
    expect(applyTemplate(moved, columnList)).toMatchObject({ rows: [], drift: true });
  });
});

describe("validateTemplate", () => {
  it("accepts a taught template", () => {
    expect(validateTemplate(template())).toEqual([]);
  });

  it("refuses missing columns, bad markers and lower-case tokens", () => {
    const bad = template({
      fingerprint: { tokens: ["item"] },
      columns: { name: { x_min: 10, x_max: 5 } },
      skip: ["x".repeat(81)],
      category_from: "column",
    });
    expect(validateTemplate(bad)).toEqual([
      "Fingerprint words must be upper-case letters.",
      "Name column is missing.",
      "Quantity column is missing.",
      "Up to 20 skip markers are allowed.",
      "Category column is missing.",
    ]);
  });
});
