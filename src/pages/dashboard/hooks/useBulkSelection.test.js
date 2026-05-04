import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useBulkSelection from "./useBulkSelection";

describe("useBulkSelection", () => {
  const makeRows = (ids) => ids.map((id) => ({ id }));

  it("starts with bulkMode off and empty selection", () => {
    const { result } = renderHook(() => useBulkSelection());
    expect(result.current.bulkMode).toBe(false);
    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.bulkLocation).toBe("");
  });

  it("toggleSelected adds an id", () => {
    const { result } = renderHook(() => useBulkSelection());
    act(() => result.current.toggleSelected("id-1"));
    expect(result.current.selectedIds).toContain("id-1");
  });

  it("toggleSelected removes an already-selected id", () => {
    const { result } = renderHook(() => useBulkSelection());
    act(() => result.current.toggleSelected("id-1"));
    act(() => result.current.toggleSelected("id-1"));
    expect(result.current.selectedIds).not.toContain("id-1");
  });

  it("toggleSelected coerces non-string ids to strings", () => {
    const { result } = renderHook(() => useBulkSelection());
    act(() => result.current.toggleSelected(42));
    expect(result.current.isSelected("42")).toBe(true);
    expect(result.current.isSelected(42)).toBe(true);
  });

  it("isSelected returns true only for selected ids", () => {
    const { result } = renderHook(() => useBulkSelection());
    act(() => result.current.toggleSelected("id-1"));
    expect(result.current.isSelected("id-1")).toBe(true);
    expect(result.current.isSelected("id-2")).toBe(false);
  });

  it("selectAllVisible selects all visible row ids", () => {
    const rows = makeRows(["a", "b", "c"]);
    const { result } = renderHook(() => useBulkSelection({ visibleRows: rows }));
    act(() => result.current.selectAllVisible());
    expect(result.current.selectedIds).toEqual(["a", "b", "c"]);
  });

  it("clearSelection empties selectedIds", () => {
    const rows = makeRows(["a", "b"]);
    const { result } = renderHook(() => useBulkSelection({ visibleRows: rows }));
    act(() => result.current.selectAllVisible());
    act(() => result.current.clearSelection());
    expect(result.current.selectedIds).toEqual([]);
  });

  it("turning bulkMode off clears selection and location", () => {
    const rows = makeRows(["a", "b"]);
    const { result } = renderHook(() => useBulkSelection({ visibleRows: rows }));

    act(() => {
      result.current.setBulkMode(true);
      result.current.selectAllVisible();
      result.current.setBulkLocation("Truck 1");
    });

    expect(result.current.selectedIds).toHaveLength(2);
    expect(result.current.bulkLocation).toBe("Truck 1");

    act(() => result.current.setBulkMode(false));

    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.bulkLocation).toBe("");
  });

  it("calls onExitBulkMode callback when bulkMode turns off", () => {
    const onExit = vi.fn();
    const { result } = renderHook(() => useBulkSelection({ onExitBulkMode: onExit }));

    act(() => result.current.setBulkMode(true));
    act(() => result.current.setBulkMode(false));

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("does not call onExitBulkMode when bulkMode stays off", () => {
    const onExit = vi.fn();
    renderHook(() => useBulkSelection({ onExitBulkMode: onExit }));
    // onExit should NOT fire on initial mount (bulkMode starts false)
    expect(onExit).toHaveBeenCalledTimes(0);
  });

  it("selectAllVisible handles empty visibleRows", () => {
    const { result } = renderHook(() => useBulkSelection({ visibleRows: [] }));
    act(() => result.current.selectAllVisible());
    expect(result.current.selectedIds).toEqual([]);
  });

  it("filters out falsy ids from visibleRows", () => {
    const rows = [{ id: "a" }, { id: "" }, { id: null }];
    const { result } = renderHook(() => useBulkSelection({ visibleRows: rows }));
    act(() => result.current.selectAllVisible());
    expect(result.current.selectedIds).toEqual(["a"]);
  });
});
