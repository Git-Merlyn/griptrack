import { describe, expect, it } from "vitest";
import { matchFileItemsToEquipment } from "./pdfSelect";

describe("pdfSelect.js", () => {
  it("matches by itemId first (selects all rows that share the itemId)", () => {
    const equipment = [
      { id: "row-1", itemId: "A100", name: "C-Stand" },
      { id: "row-2", itemId: "A100", name: "C-Stand (duplicate itemId)" },
      { id: "row-3", itemId: "B200", name: "Apple Box" },
    ];

    const items = [{ id: "A100", name: "does not matter" }];

    const res = matchFileItemsToEquipment({ items, equipment });

    expect(res.ids.sort()).toEqual(["row-1", "row-2"]);
    expect(res.ambiguous).toBe(1); // multiple rows share itemId
    expect(res.notFound).toBe(0);
  });

  it("itemId match wins even if the name is wrong", () => {
    const equipment = [
      { id: "row-1", itemId: "A100", name: "C-Stand" },
      { id: "row-2", itemId: "B200", name: "Apple Box" },
    ];

    const items = [{ id: "A100", name: "Totally Different" }];

    const res = matchFileItemsToEquipment({ items, equipment });

    expect(res.ids).toEqual(["row-1"]);
    expect(res.ambiguous).toBe(0);
    expect(res.notFound).toBe(0);
  });

  it("falls back to normalized name match when itemId is missing", () => {
    const equipment = [
      { id: "row-1", itemId: null, name: "4x4 Floppy" },
      { id: "row-2", itemId: null, name: "Apple Box" },
    ];

    const items = [{ name: " 4X4   FLOPPY!! " }];

    const res = matchFileItemsToEquipment({ items, equipment });

    expect(res.ids).toEqual(["row-1"]);
    expect(res.ambiguous).toBe(0);
    expect(res.notFound).toBe(0);
  });

  it("counts ambiguous when name matches multiple DB rows and selects all matches", () => {
    const equipment = [
      { id: "row-1", itemId: null, name: "C-Stand" },
      { id: "row-2", itemId: null, name: "C Stand" }, // normalizes to same key
      { id: "row-3", itemId: null, name: "Apple Box" },
    ];

    const items = [{ name: "c-stand" }];

    const res = matchFileItemsToEquipment({ items, equipment });

    expect(res.ids.sort()).toEqual(["row-1", "row-2"]);
    expect(res.ambiguous).toBe(1);
    expect(res.notFound).toBe(0);
  });

  it("increments notFound when no itemId or name match is found", () => {
    const equipment = [{ id: "row-1", itemId: "X1", name: "Thing" }];
    const items = [{ id: "NOPE", name: "Unknown" }, { name: "Also Unknown" }];

    const res = matchFileItemsToEquipment({ items, equipment });

    expect(res.ids).toEqual([]);
    expect(res.ambiguous).toBe(0);
    expect(res.notFound).toBe(2);
  });

  it("dedupes selected ids when multiple input lines match the same row", () => {
    const equipment = [{ id: "row-1", itemId: "A1", name: "C-Stand" }];
    const items = [{ id: "A1" }, { id: "A1" }, { name: "c stand" }];

    const res = matchFileItemsToEquipment({ items, equipment });

    expect(res.ids).toEqual(["row-1"]);
    // ambiguous: itemId matches array length 1; name matches array length 1 => 0
    expect(res.ambiguous).toBe(0);
    // third line matched by name, so notFound stays 0
    expect(res.notFound).toBe(0);
  });

  it("ignores blank/whitespace-only lines", () => {
    const equipment = [{ id: "row-1", itemId: "A1", name: "C-Stand" }];
    const items = [{ name: "   " }, {}, { id: "", name: "" }];

    const res = matchFileItemsToEquipment({ items, equipment });

    expect(res.ids).toEqual([]);
    expect(res.ambiguous).toBe(0);
    expect(res.notFound).toBe(0);
  });
});
