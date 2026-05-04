import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildSummary, summaryCsv, summaryPrintHtml } from "./summary";

describe("summary.js", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-04T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const equipment = [
    { name: "C-Stand",    category: "Stands", location: "Truck 1", status: "Available", quantity: 5 },
    { name: "Apple Box",  category: "Misc",   location: "Truck 1", status: "Out",       quantity: 3 },
    { name: "4x4 Floppy", category: "Flags",  location: "Truck 2", status: "Available", quantity: 2 },
    { name: "Unnamed",    category: "",        location: "",         status: "",          quantity: "1" },
  ];

  describe("buildSummary", () => {
    it("returns correct totalItems and totalQty", () => {
      const s = buildSummary(equipment);
      expect(s.totalItems).toBe(4);
      expect(s.totalQty).toBe(11);
    });

    it("groups byCategory, uses (Uncategorized) for missing category", () => {
      const s = buildSummary(equipment);
      const names = s.byCategory.map((c) => c.name);
      expect(names).toContain("Stands");
      expect(names).toContain("Misc");
      expect(names).toContain("Flags");
      expect(names).toContain("(Uncategorized)");
    });

    it("sorts byCategory by qty descending, then name asc", () => {
      const s = buildSummary(equipment);
      // Stands (qty 5) > Misc (3) > Flags (2)
      const idx = (n) => s.byCategory.findIndex((c) => c.name === n);
      expect(idx("Stands")).toBeLessThan(idx("Misc"));
      expect(idx("Misc")).toBeLessThan(idx("Flags"));
    });

    it("groups byLocation, uses (Unassigned) for missing location", () => {
      const s = buildSummary(equipment);
      const names = s.byLocation.map((l) => l.name);
      expect(names).toContain("Truck 1");
      expect(names).toContain("Truck 2");
      expect(names).toContain("(Unassigned)");
    });

    it("groups byStatus, uses (Unknown) for missing status", () => {
      const s = buildSummary(equipment);
      const names = s.byStatus.map((s) => s.name);
      expect(names).toContain("Available");
      expect(names).toContain("Out");
      expect(names).toContain("(Unknown)");
    });

    it("accumulates count and qty per group correctly", () => {
      const s = buildSummary(equipment);
      const truck1 = s.byLocation.find((l) => l.name === "Truck 1");
      expect(truck1.count).toBe(2); // C-Stand + Apple Box
      expect(truck1.qty).toBe(8);   // 5 + 3
    });

    it("coerces string quantities to numbers", () => {
      const s = buildSummary([{ name: "X", category: "C", location: "L", status: "S", quantity: "7" }]);
      expect(s.totalQty).toBe(7);
    });

    it("handles empty array", () => {
      const s = buildSummary([]);
      expect(s.totalItems).toBe(0);
      expect(s.totalQty).toBe(0);
      expect(s.byCategory).toEqual([]);
    });

    it("handles non-array input gracefully", () => {
      const s = buildSummary(null);
      expect(s.totalItems).toBe(0);
    });
  });

  describe("summaryCsv", () => {
    it("starts with UTF-8 BOM", () => {
      const csv = summaryCsv(buildSummary(equipment));
      expect(csv.startsWith("﻿")).toBe(true);
    });

    it("includes all three section headers", () => {
      const csv = summaryCsv(buildSummary(equipment));
      expect(csv).toContain("By Category");
      expect(csv).toContain("By Location");
      expect(csv).toContain("By Status");
    });

    it("includes a TOTAL row in each section (3 total)", () => {
      const csv = summaryCsv(buildSummary(equipment));
      const matches = csv.match(/TOTAL/g);
      expect(matches).toHaveLength(3);
    });

    it("includes current date stamp", () => {
      const csv = summaryCsv(buildSummary(equipment));
      expect(csv).toContain("2026-02-04");
    });

    it("includes category names in output", () => {
      const csv = summaryCsv(buildSummary(equipment));
      expect(csv).toContain("Stands");
      expect(csv).toContain("Misc");
    });
  });

  describe("summaryPrintHtml", () => {
    it("includes all section headings", () => {
      const html = summaryPrintHtml(buildSummary(equipment));
      expect(html).toContain("By Category");
      expect(html).toContain("By Location");
      expect(html).toContain("By Status");
    });

    it("escapes HTML entities in group keys (category, location, status)", () => {
      const custom = [
        { name: "Item", category: "A & B cats", location: "<Truck>", status: "Out & About", quantity: 1 },
      ];
      const html = summaryPrintHtml(buildSummary(custom));
      expect(html).toContain("A &amp; B cats");
      expect(html).toContain("&lt;Truck&gt;");
      expect(html).toContain("Out &amp; About");
    });

    it("includes the date stamp in the title", () => {
      const html = summaryPrintHtml(buildSummary(equipment));
      expect(html).toContain("2026-02-04");
    });

    it("includes window.print() trigger script", () => {
      const html = summaryPrintHtml(buildSummary(equipment));
      expect(html).toContain("window.print()");
    });

    it("renders a Total row in each table", () => {
      const html = summaryPrintHtml(buildSummary(equipment));
      const totalMatches = html.match(/Total<\/strong>/g);
      expect(totalMatches).toHaveLength(3);
    });
  });
});
