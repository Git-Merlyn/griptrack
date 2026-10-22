import { describe, it, expect } from "vitest";
import { validateItemForm } from "./itemValidation";

const base = {
  name: "C-Stand",
  location: "Truck 1",
  quantity: 2,
  reserveMin: 0,
  rentalStart: "",
  rentalEnd: "",
};

describe("validateItemForm", () => {
  it("accepts a normal item and returns the numbers to save", () => {
    expect(validateItemForm(base)).toEqual({ ok: true, quantity: 2, reserveMin: 0 });
  });

  it("requires a name (whitespace does not count)", () => {
    expect(validateItemForm({ ...base, name: "   " })).toEqual({
      ok: false,
      error: "Name is required.",
    });
  });

  it("requires a location", () => {
    expect(validateItemForm({ ...base, location: "" }).error).toBe("Choose a location.");
  });

  it("rejects a negative quantity even when a reserve minimum is set (L12)", () => {
    const r = validateItemForm({ ...base, quantity: -5, reserveMin: 3 });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Quantity and reserve minimum can't be negative.");
  });

  it("rejects a negative reserve minimum", () => {
    expect(validateItemForm({ ...base, reserveMin: -1 }).ok).toBe(false);
  });

  it("rejects quantity 0 without a reserve minimum", () => {
    const r = validateItemForm({ ...base, quantity: 0, reserveMin: 0 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/at least 1/);
  });

  it("treats a blank quantity as 0", () => {
    expect(validateItemForm({ ...base, quantity: "" }).ok).toBe(false);
    expect(validateItemForm({ ...base, quantity: "", reserveMin: 2 })).toEqual({
      ok: true,
      quantity: 0,
      reserveMin: 2,
    });
  });

  it("allows quantity 0 when a reserve minimum is set", () => {
    expect(validateItemForm({ ...base, quantity: 0, reserveMin: 2 }).ok).toBe(true);
  });

  it("rejects non-integer numbers", () => {
    expect(validateItemForm({ ...base, quantity: "abc" }).ok).toBe(false);
    expect(validateItemForm({ ...base, quantity: 1.5 }).ok).toBe(false);
  });

  it("rejects a start date after the end date", () => {
    const r = validateItemForm({ ...base, rentalStart: "2026-05-02", rentalEnd: "2026-05-01" });
    expect(r).toEqual({ ok: false, error: "Start date must be on or before the end date." });
  });

  it("allows only one of the dates, or equal dates", () => {
    expect(validateItemForm({ ...base, rentalStart: "2026-05-02" }).ok).toBe(true);
    expect(validateItemForm({ ...base, rentalEnd: "2026-05-02" }).ok).toBe(true);
    expect(
      validateItemForm({ ...base, rentalStart: "2026-05-02", rentalEnd: "2026-05-02" }).ok,
    ).toBe(true);
  });
});
