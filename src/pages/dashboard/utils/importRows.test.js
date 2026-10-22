import { describe, it, expect } from "vitest";
import { buildImportRows } from "./importRows";

const parsed = (overrides = {}) => ({
  id: "STG0012",
  name: "Stinger 25'",
  category: "",
  source: "Dean",
  status: "Available",
  quantity: 4,
  startDate: "2026-05-01",
  endDate: "2026-05-10",
  location: "Truck 1",
  ...overrides,
});

describe("buildImportRows", () => {
  it("maps a parsed row to the addMultipleItems shape", () => {
    const { rows, skipped } = buildImportRows([parsed()], "Chris");
    expect(skipped).toBe(0);
    expect(rows).toEqual([
      {
        itemId: "STG0012",
        name: "Stinger 25'",
        category: "",
        source: "Dean",
        location: "Truck 1",
        status: "Available",
        rentalStart: "2026-05-01",
        rentalEnd: "2026-05-10",
        quantity: 4,
        reserveMin: 0,
        updatedBy: "Chris",
      },
    ]);
  });

  it("keeps rows with a blank location (stored as Unassigned by the context) (M7)", () => {
    const { rows, skipped } = buildImportRows(
      [parsed({ location: "" }), parsed({ location: undefined })],
      "Chris",
    );
    expect(skipped).toBe(0);
    expect(rows.map((r) => r.location)).toEqual(["", ""]);
  });

  it("skips rows with no name or a quantity <= 0 and counts them", () => {
    const { rows, skipped } = buildImportRows(
      [parsed({ name: "  " }), parsed({ quantity: 0 }), parsed({ quantity: "x" }), parsed()],
      "Chris",
    );
    expect(rows).toHaveLength(1);
    expect(skipped).toBe(3);
  });

  it("accepts numeric strings and never sends a negative reserve minimum", () => {
    const { rows } = buildImportRows([parsed({ quantity: "3", reserveMin: -2 })], "Chris");
    expect(rows[0].quantity).toBe(3);
    expect(rows[0].reserveMin).toBe(0);
  });

  it("handles a non-array input", () => {
    expect(buildImportRows(null, "Chris")).toEqual({ rows: [], skipped: 0 });
  });
});
