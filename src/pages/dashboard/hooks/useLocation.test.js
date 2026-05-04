import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
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

  it("addCustomLocation adds a new location", () => {
    const { result } = renderHook(() => useLocation());
    act(() => result.current.addCustomLocation("New Place"));
    expect(result.current.allLocations).toContain("New Place");
  });

  it("addCustomLocation ignores empty/whitespace-only string", () => {
    const { result } = renderHook(() => useLocation());
    act(() => result.current.addCustomLocation(""));
    act(() => result.current.addCustomLocation("   "));
    expect(result.current.allLocations).toEqual([]);
  });

  it("addCustomLocation does not add duplicates (case-insensitive)", () => {
    const { result } = renderHook(() => useLocation());
    act(() => {
      result.current.addCustomLocation("Truck");
      result.current.addCustomLocation("TRUCK");
      result.current.addCustomLocation("truck");
    });
    const trucks = result.current.allLocations.filter(
      (l) => l.toLowerCase() === "truck"
    );
    expect(trucks).toHaveLength(1);
  });

  it("addCustomLocation trims whitespace", () => {
    const { result } = renderHook(() => useLocation());
    act(() => result.current.addCustomLocation("  Stage  "));
    expect(result.current.allLocations).toContain("Stage");
  });

  it("persists custom locations to localStorage", () => {
    const { result } = renderHook(() =>
      useLocation({ storageKey: "test_locs" })
    );
    act(() => result.current.addCustomLocation("Depot"));
    const stored = JSON.parse(localStorage.getItem("test_locs"));
    expect(stored).toContain("Depot");
  });

  it("loads custom locations from localStorage on init", () => {
    localStorage.setItem(
      "griptrack_custom_locations",
      JSON.stringify(["Warehouse"])
    );
    const { result } = renderHook(() => useLocation());
    expect(result.current.allLocations).toContain("Warehouse");
  });

  it("merges all three sources without duplicates", () => {
    localStorage.setItem(
      "griptrack_custom_locations",
      JSON.stringify(["Depot"])
    );
    const { result } = renderHook(() =>
      useLocation({
        contextLocations: ["Truck 1"],
        equipment: [{ location: "Stage" }],
      })
    );
    expect(result.current.allLocations).toContain("Truck 1");
    expect(result.current.allLocations).toContain("Stage");
    expect(result.current.allLocations).toContain("Depot");
    // No duplicates
    expect(new Set(result.current.allLocations).size).toBe(result.current.allLocations.length);
  });
});
