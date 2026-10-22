import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import useLocation from "./useLocation";

describe("useLocation", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("includes contextLocations in allLocations", () => {
    const { result } = renderHook(() =>
      useLocation({ contextLocations: ["Truck 1", "Truck 2"] })
    );
    expect(result.current.allLocations).toContain("Truck 1");
    expect(result.current.allLocations).toContain("Truck 2");
  });

  it("infers locations from equipment rows", () => {
    const equipment = [{ location: "Stage" }, { location: "Depot" }];
    const { result } = renderHook(() => useLocation({ equipment }));
    expect(result.current.allLocations).toContain("Stage");
    expect(result.current.allLocations).toContain("Depot");
  });

  it("ignores equipment rows with blank location", () => {
    const equipment = [{ location: "" }, { location: "  " }, { location: null }];
    const { result } = renderHook(() => useLocation({ equipment }));
    expect(result.current.allLocations).toEqual([]);
  });

  it("allLocations is sorted alphabetically", () => {
    const { result } = renderHook(() =>
      useLocation({ contextLocations: ["Zulu", "Alpha", "Mike"] })
    );
    expect(result.current.allLocations).toEqual(["Alpha", "Mike", "Zulu"]);
  });

  it("deduplicates case-insensitively, keeping context casing", () => {
    const { result } = renderHook(() =>
      useLocation({
        contextLocations: ["Truck 1"],
        equipment: [{ location: "TRUCK 1" }],
      })
    );
    const matches = result.current.allLocations.filter(
      (l) => l.toLowerCase() === "truck 1"
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]).toBe("Truck 1");
  });

  it("merges context and equipment sources without duplicates", () => {
    const { result } = renderHook(() =>
      useLocation({
        contextLocations: ["Truck 1", "Stage"],
        equipment: [{ location: "Stage" }, { location: "Unassigned" }],
      })
    );
    expect(result.current.allLocations).toEqual(["Stage", "Truck 1", "Unassigned"]);
  });

  it("does not read device-local lists left by older builds (L10, D63 = B)", () => {
    localStorage.setItem("griptrack_custom_locations", JSON.stringify(["Warehouse"]));
    localStorage.setItem("customLocations", JSON.stringify(["Old A"]));
    localStorage.setItem("griptrack_locations_custom", JSON.stringify(["Old B"]));
    const { result } = renderHook(() =>
      useLocation({ contextLocations: ["Truck 1"] })
    );
    expect(result.current.allLocations).toEqual(["Truck 1"]);
    // Old keys are left in the browser untouched
    expect(JSON.parse(localStorage.getItem("griptrack_custom_locations"))).toEqual(["Warehouse"]);
  });

  it("exposes no way to add a device-local location", () => {
    const { result } = renderHook(() => useLocation());
    expect(Object.keys(result.current)).toEqual(["allLocations"]);
  });
});
