import { describe, expect, it, vi, afterEach } from "vitest";
import {
  statusClass,
  getQty,
  qtyTextClass,
  parseDateLoose,
  dateTextClass,
  normalizeName,
} from "./helpers";

describe("helpers.js", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("statusClass maps known statuses", () => {
    expect(statusClass("Available")).toBe("text-success");
    expect(statusClass(" out ")).toBe("text-warning");
    expect(statusClass("DAMAGED")).toBe("text-danger");
    expect(statusClass("SomethingElse")).toBe("text-text");
    expect(statusClass(null)).toBe("text-text");
  });

  it("getQty parses numeric and string quantities safely", () => {
    expect(getQty({ quantity: 5 })).toBe(5);
    expect(getQty({ quantity: "12" })).toBe(12);
    expect(getQty({ quantity: " 7 " })).toBe(7);
    expect(getQty({ quantity: "" })).toBe(0);
    expect(getQty({ quantity: null })).toBe(0);
    expect(getQty({})).toBe(0);
  });

  it("qtyTextClass: red when reserveMin > 0 and quantity === 0", () => {
    expect(qtyTextClass({ quantity: 0, reserveMin: 1 })).toContain(
      "text-danger",
    );
    expect(qtyTextClass({ quantity: "0", reserveMin: "2" })).toContain(
      "text-danger",
    );
  });

  it("qtyTextClass: yellow when 0 < quantity < reserveMin", () => {
    expect(qtyTextClass({ quantity: 1, reserveMin: 2 })).toContain(
      "text-warning",
    );
    expect(qtyTextClass({ quantity: "1", reserveMin: "5" })).toContain(
      "text-warning",
    );
  });

  it("qtyTextClass: no class when reserveMin is 0 or quantity >= reserveMin", () => {
    expect(qtyTextClass({ quantity: 0, reserveMin: 0 })).toBe("");
    expect(qtyTextClass({ quantity: 10, reserveMin: 5 })).toBe("");
    expect(qtyTextClass({ quantity: 5, reserveMin: 5 })).toBe("");
  });

  it("qtyTextClass: treats missing/empty quantity as 0 (red if reserveMin > 0)", () => {
    expect(qtyTextClass({ reserveMin: 2 })).toContain("text-danger");
    expect(qtyTextClass({ quantity: "", reserveMin: 2 })).toContain(
      "text-danger",
    );
    expect(qtyTextClass({ quantity: null, reserveMin: 2 })).toContain(
      "text-danger",
    );
  });

  it("qtyTextClass: parses reserveMin strings robustly", () => {
    expect(qtyTextClass({ quantity: 1, reserveMin: "3" })).toContain(
      "text-warning",
    );
    expect(qtyTextClass({ quantity: 0, reserveMin: "3" })).toContain(
      "text-danger",
    );
    expect(qtyTextClass({ quantity: 2, reserveMin: "0" })).toBe("");
  });

  it("parseDateLoose handles yyyy-mm-dd and mm/dd/yyyy", () => {
    expect(parseDateLoose("2026-02-04")).toBeInstanceOf(Date);
    expect(parseDateLoose("2/4/2026")).toBeInstanceOf(Date);
    expect(parseDateLoose("")).toBe(null);
    expect(parseDateLoose(null)).toBe(null);
  });

  it("dateTextClass: start date yellow within next 7 days; normal after", () => {
    // Freeze time to make this deterministic
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T12:00:00Z"));

    expect(dateTextClass("2026-02-04", "start")).toBe("text-yellow-300"); // 3 days ahead
    expect(dateTextClass("2026-02-20", "start")).toBe("text-gray-200"); // beyond 7 days
    expect(dateTextClass("2026-01-31", "start")).toBe("text-gray-200"); // past -> normal
  });

  it("dateTextClass: exactly 7 days ahead is yellow (start and end)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T12:00:00Z"));

    expect(dateTextClass("2026-02-08", "start")).toBe("text-yellow-300");
    expect(dateTextClass("2026-02-08", "end")).toBe("text-yellow-300");
  });

  it("dateTextClass: end date red if past; yellow within week; gray otherwise", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T12:00:00Z"));

    expect(dateTextClass("2026-01-31", "end")).toBe("text-red-400"); // past
    expect(dateTextClass("2026-02-04", "end")).toBe("text-yellow-300"); // within 7 days
    expect(dateTextClass("2026-02-20", "end")).toBe("text-gray-200"); // later
  });

  it("dateTextClass: invalid/null dates return neutral gray", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T12:00:00Z"));

    expect(dateTextClass(null, "start")).toBe("text-gray-300");
    expect(dateTextClass("", "end")).toBe("text-gray-300");
    expect(dateTextClass("not-a-date", "end")).toBe("text-gray-300");
  });

  it("normalizeName lowercases, normalizes apostrophes, strips punctuation, condenses spaces", () => {
    expect(normalizeName("  Bob’s  4x4—Floppy!!  ")).toBe("bob's 4x4 floppy");
    expect(normalizeName('C-Stand (40")')).toBe("c stand 40");
  });
});
