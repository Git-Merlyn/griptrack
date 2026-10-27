import { describe, it, expect } from "vitest";
import { applyTemplate } from "@pdf/templates.js";
import { columnList } from "@pdf/__fixtures__/synthetic.js";
import { buildTemplate, defaultLayoutName, headingsFor, lineText, pageOneLines } from "./teachLayout";

// Page 1 lines: 0 supplier, 1 dates, 2 headings, 3 "Grip", ..., 8 "Subtotal 24".
const lines = pageOneLines(columnList);
const subtotal = lines.findIndex((l) => lineText(l).startsWith("Subtotal"));

describe("teachLayout (WP26 Phase 3)", () => {
  it("lists the headings of the chosen line", () => {
    expect(headingsFor(columnList, 2).map((h) => h.label)).toEqual(["Item Description", "Category", "Qty"]);
  });

  it("builds a valid template from the teacher's choices", () => {
    const { template, errors } = buildTemplate(columnList, {
      headerIndex: 2,
      nameColumn: 0,
      quantityColumn: 2,
      categoryColumn: 1,
      codeColumn: -1,
      categoryFrom: "column",
      endIndex: -1,
      skipIndexes: [subtotal],
    });
    expect(errors).toBeUndefined();
    // Markers keep no numbers or other text from this rental.
    expect(template.table).toEqual({ start_after: "ITEM DESCRIPTION CATEGORY" });
    expect(template.skip).toEqual(["SUBTOTAL"]);
    expect(template.fingerprint.tokens).toContain("CASCADE");
    expect(applyTemplate(template, columnList).rows.map((r) => r.name)).toEqual([
      "Apple Box Full",
      "Sandbag 25lb",
      "Stinger 25ft",
      "Furniture Pad",
    ]);
  });

  it("reports what is missing", () => {
    expect(buildTemplate(columnList, { headerIndex: -1 }).errors).toEqual(["Choose the line with the column headings."]);
    expect(buildTemplate(columnList, { headerIndex: 2, nameColumn: 0, quantityColumn: -1, categoryFrom: "none" }).errors).toEqual([
      "Quantity column is missing.",
    ]);
  });

  it("names a new layout after the top line", () => {
    expect(defaultLayoutName(columnList)).toBe("CASCADE STUDIO RENTALS");
  });
});
