import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useEditFlow from "./useEditFlow";

describe("useEditFlow", () => {
  it("starts with editingId null and modals closed", () => {
    const { result } = renderHook(() => useEditFlow());
    expect(result.current.editingId).toBeNull();
    expect(result.current.showDesktopEditModal).toBe(false);
    expect(result.current.showMobileEditModal).toBe(false);
  });

  it("newItem starts with correct defaults", () => {
    const { result } = renderHook(() => useEditFlow());
    expect(result.current.newItem.status).toBe("Available");
    expect(result.current.newItem.quantity).toBe(1);
    expect(result.current.newItem.reserveMin).toBe(0);
    expect(result.current.newItem.name).toBe("");
  });

  it("defaults prop overrides default item fields", () => {
    const { result } = renderHook(() =>
      useEditFlow({ defaults: { location: "Default Truck", quantity: 5 } })
    );
    expect(result.current.newItem.location).toBe("Default Truck");
    expect(result.current.newItem.quantity).toBe(5);
  });

  it("openAdd opens desktop modal when isMobile is false", () => {
    const { result } = renderHook(() => useEditFlow({ isMobile: false }));
    act(() => result.current.openAdd());
    expect(result.current.showDesktopEditModal).toBe(true);
    expect(result.current.showMobileEditModal).toBe(false);
    expect(result.current.editingId).toBeNull();
  });

  it("openAdd opens mobile modal when isMobile is true", () => {
    const { result } = renderHook(() => useEditFlow({ isMobile: true }));
    act(() => result.current.openAdd());
    expect(result.current.showMobileEditModal).toBe(true);
    expect(result.current.showDesktopEditModal).toBe(false);
  });

  it("openAdd resets newItem to defaults", () => {
    const { result } = renderHook(() => useEditFlow({ isMobile: false }));
    act(() => result.current.setField("name", "Some Item"));
    act(() => result.current.openAdd());
    expect(result.current.newItem.name).toBe("");
  });

  it("openEditForItem sets editingId and populates newItem", () => {
    const item = {
      id: "item-1",
      itemId: "CS-001",
      name: "C-Stand",
      category: "Stands",
      source: "Dean",
      location: "Truck 1",
      status: "Out",
      rentalStart: "2026-02-01",
      rentalEnd: "2026-02-10",
      quantity: 5,
      reserveMin: 2,
    };
    const { result } = renderHook(() => useEditFlow({ isMobile: false }));
    act(() => result.current.openEditForItem(item));

    expect(result.current.editingId).toBe("item-1");
    expect(result.current.newItem.name).toBe("C-Stand");
    expect(result.current.newItem.quantity).toBe(5);
    expect(result.current.newItem.reserveMin).toBe(2);
    expect(result.current.newItem.status).toBe("Out");
    expect(result.current.showDesktopEditModal).toBe(true);
  });

  it("openEditForItem does nothing when item is null", () => {
    const { result } = renderHook(() => useEditFlow({ isMobile: false }));
    act(() => result.current.openEditForItem(null));
    expect(result.current.editingId).toBeNull();
    expect(result.current.showDesktopEditModal).toBe(false);
  });

  it("setField updates a single field without touching others", () => {
    const { result } = renderHook(() => useEditFlow());
    act(() => result.current.setField("name", "Apple Box"));
    expect(result.current.newItem.name).toBe("Apple Box");
    expect(result.current.newItem.status).toBe("Available"); // unchanged
  });

  it("cancelEdit closes modal, resets editingId and newItem", () => {
    const { result } = renderHook(() => useEditFlow({ isMobile: false }));
    act(() => result.current.openAdd());
    act(() => result.current.setField("name", "Temp"));
    act(() => result.current.cancelEdit());

    expect(result.current.showDesktopEditModal).toBe(false);
    expect(result.current.editingId).toBeNull();
    expect(result.current.newItem.name).toBe("");
  });

  it("closeEdit preserves fields when an edit is active (editingId is set)", () => {
    const { result } = renderHook(() => useEditFlow({ isMobile: false }));
    // Open an edit session so editingId is set
    act(() => result.current.openEditForItem({ id: "x", name: "Item" }));
    act(() => result.current.setField("name", "Preserved"));
    act(() => result.current.closeEdit());

    // editingId still set → sync-to-defaults effect does NOT fire
    expect(result.current.showDesktopEditModal).toBe(false);
    expect(result.current.newItem.name).toBe("Preserved");
    expect(result.current.editingId).toBe("x"); // not cleared by closeEdit
  });

  it("calls onBeforeOpen when openAdd is called", () => {
    const onBeforeOpen = vi.fn();
    const { result } = renderHook(() =>
      useEditFlow({ isMobile: false, onBeforeOpen })
    );
    act(() => result.current.openAdd());
    expect(onBeforeOpen).toHaveBeenCalledTimes(1);
  });

  it("calls onBeforeOpen when openEditForItem is called", () => {
    const onBeforeOpen = vi.fn();
    const { result } = renderHook(() =>
      useEditFlow({ isMobile: false, onBeforeOpen })
    );
    act(() => result.current.openEditForItem({ id: "x", name: "Item" }));
    expect(onBeforeOpen).toHaveBeenCalledTimes(1);
  });
});
