import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useFilterPresets from "./useFilterPresets";

describe("useFilterPresets", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("initializes with empty presets when localStorage is empty", () => {
    const { result } = renderHook(() => useFilterPresets({ orgId: "org-1" }));
    expect(result.current.presets).toEqual([]);
  });

  it("savePreset adds a preset with an id, name, and filters", () => {
    const { result } = renderHook(() => useFilterPresets({ orgId: "org-1" }));

    act(() => result.current.savePreset("Low Stock", { showBelowReserve: true }));

    expect(result.current.presets).toHaveLength(1);
    expect(result.current.presets[0].name).toBe("Low Stock");
    expect(result.current.presets[0].filters).toEqual({ showBelowReserve: true });
    expect(result.current.presets[0].id).toBeTruthy();
  });

  it("savePreset trims whitespace from name", () => {
    const { result } = renderHook(() => useFilterPresets({ orgId: "org-1" }));
    act(() => result.current.savePreset("  My Filter  ", {}));
    expect(result.current.presets[0].name).toBe("My Filter");
  });

  it("savePreset ignores blank names", () => {
    const { result } = renderHook(() => useFilterPresets({ orgId: "org-1" }));
    act(() => result.current.savePreset("   ", {}));
    act(() => result.current.savePreset("", {}));
    expect(result.current.presets).toHaveLength(0);
  });

  it("savePreset persists to localStorage under org-scoped key", () => {
    const { result } = renderHook(() => useFilterPresets({ orgId: "org-1" }));
    act(() => result.current.savePreset("My Preset", { filterStatus: "Out" }));

    const stored = JSON.parse(localStorage.getItem("gt_filter_presets_org-1"));
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("My Preset");
  });

  it("accumulates multiple presets correctly (no stale-closure drop)", () => {
    const { result } = renderHook(() => useFilterPresets({ orgId: "org-1" }));
    act(() => {
      result.current.savePreset("A", { filterLocation: "Truck 1" });
      result.current.savePreset("B", { filterStatus: "Out" });
    });
    expect(result.current.presets).toHaveLength(2);
    expect(result.current.presets.map((p) => p.name)).toEqual(["A", "B"]);
  });

  it("deletePreset removes the correct preset by id", () => {
    const { result } = renderHook(() => useFilterPresets({ orgId: "org-1" }));
    act(() => {
      result.current.savePreset("A", {});
      result.current.savePreset("B", {});
    });

    const idToDelete = result.current.presets[0].id;
    act(() => result.current.deletePreset(idToDelete));

    expect(result.current.presets).toHaveLength(1);
    expect(result.current.presets[0].name).toBe("B");
  });

  it("deletePreset syncs removal to localStorage", () => {
    const { result } = renderHook(() => useFilterPresets({ orgId: "org-1" }));
    act(() => result.current.savePreset("A", {}));

    const id = result.current.presets[0].id;
    act(() => result.current.deletePreset(id));

    const stored = JSON.parse(localStorage.getItem("gt_filter_presets_org-1"));
    expect(stored).toHaveLength(0);
  });

  it("loads saved presets from localStorage on init", () => {
    const stored = [{ id: "abc", name: "Saved", filters: { filterStatus: "Out" } }];
    localStorage.setItem("gt_filter_presets_org-1", JSON.stringify(stored));

    const { result } = renderHook(() => useFilterPresets({ orgId: "org-1" }));
    expect(result.current.presets).toHaveLength(1);
    expect(result.current.presets[0].name).toBe("Saved");
  });

  it("uses 'default' storage key when orgId is not provided", () => {
    const { result } = renderHook(() => useFilterPresets());
    act(() => result.current.savePreset("X", {}));
    expect(localStorage.getItem("gt_filter_presets_default")).toBeTruthy();
  });
});
