import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import useInventoryView from "./useInventoryView";

// useInventoryView depends on useDebounce which uses setTimeout.
// We control time manually so tests don't have to wait.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// ── Fixtures ───────────────────────────────────────────────────────────────
const makeItem = (overrides = {}) => ({
  id: overrides.id ?? "1",
  name: overrides.name ?? "C-Stand",
  category: overrides.category ?? "Grip",
  location: overrides.location ?? "G&E Truck",
  status: overrides.status ?? "Available",
  quantity: overrides.quantity ?? 10,
  reserveMin: overrides.reserveMin ?? 0,
  rentalStart: overrides.rentalStart ?? null,
  rentalEnd: overrides.rentalEnd ?? null,
  source: overrides.source ?? "House",
  updatedBy: overrides.updatedBy ?? "admin",
  ...overrides,
});

const ITEMS = [
  makeItem({ id: "1", name: "C-Stand",    category: "Grip",     location: "G&E Truck", status: "Available", quantity: 10, reserveMin: 5 }),
  makeItem({ id: "2", name: "Apple Box",  category: "Grip",     location: "Stage A",   status: "Available", quantity: 3,  reserveMin: 0 }),
  makeItem({ id: "3", name: "SkyPanel",   category: "Electric", location: "G&E Truck", status: "Out",       quantity: 2,  reserveMin: 4 }),
  makeItem({ id: "4", name: "Sandbag",    category: "Grip",     location: "Stage B",   status: "Damaged",   quantity: 8,  reserveMin: 0 }),
  makeItem({ id: "5", name: "__placeholder__" }), // should always be filtered out
];

// ── Helpers ────────────────────────────────────────────────────────────────
function render(equipment = ITEMS, opts = {}) {
  return renderHook(() => useInventoryView({ equipment, ...opts }));
}

function flush() {
  act(() => vi.runAllTimers());
}

// ── Baseline ───────────────────────────────────────────────────────────────
describe("baseline", () => {
  it("excludes __placeholder__ items from visibleEquipment", () => {
    const { result } = render();
    const names = result.current.visibleEquipment.map((i) => i.name);
    expect(names).not.toContain("__placeholder__");
    expect(names).toHaveLength(4);
  });

  it("returns all real items in sortedEquipment by default (name asc)", () => {
    const { result } = render();
    const names = result.current.sortedEquipment.map((i) => i.name);
    expect(names).toEqual(["Apple Box", "C-Stand", "Sandbag", "SkyPanel"]);
  });
});

// ── Search ────────────────────────────────────────────────────────────────
describe("search", () => {
  it("filters by name (case-insensitive) after debounce", () => {
    const { result } = render();
    act(() => result.current.setSearchQuery("sky"));
    flush();
    expect(result.current.sortedEquipment).toHaveLength(1);
    expect(result.current.sortedEquipment[0].name).toBe("SkyPanel");
  });

  it("returns empty list when no items match", () => {
    const { result } = render();
    act(() => result.current.setSearchQuery("zzznomatch"));
    flush();
    expect(result.current.sortedEquipment).toHaveLength(0);
  });

  it("shows all items when search is cleared", () => {
    const { result } = render();
    act(() => result.current.setSearchQuery("sky"));
    flush();
    act(() => result.current.setSearchQuery(""));
    flush();
    expect(result.current.sortedEquipment).toHaveLength(4);
  });
});

// ── Filters ───────────────────────────────────────────────────────────────
describe("filters", () => {
  it("filterLocation narrows results", () => {
    const { result } = render();
    act(() => result.current.setFilterLocation("Stage A"));
    const names = result.current.sortedEquipment.map((i) => i.name);
    expect(names).toEqual(["Apple Box"]);
  });

  it("filterStatus narrows results", () => {
    const { result } = render();
    act(() => result.current.setFilterStatus("Damaged"));
    const names = result.current.sortedEquipment.map((i) => i.name);
    expect(names).toEqual(["Sandbag"]);
  });

  it("filterCategory narrows results", () => {
    const { result } = render();
    act(() => result.current.setFilterCategory("Electric"));
    const names = result.current.sortedEquipment.map((i) => i.name);
    expect(names).toEqual(["SkyPanel"]);
  });

  it("multiple filters compose (AND logic)", () => {
    const { result } = render();
    act(() => {
      result.current.setFilterLocation("G&E Truck");
      result.current.setFilterCategory("Grip");
    });
    const names = result.current.sortedEquipment.map((i) => i.name);
    expect(names).toEqual(["C-Stand"]);
  });

  it("showBelowReserve only shows items below their reserve minimum", () => {
    // C-Stand: qty 10, reserveMin 5 — NOT below reserve
    // SkyPanel: qty 2, reserveMin 4 — IS below reserve
    // Apple Box / Sandbag: reserveMin 0 — excluded (reserve=0 means no threshold)
    const { result } = render();
    act(() => result.current.setShowBelowReserve(true));
    const names = result.current.sortedEquipment.map((i) => i.name);
    expect(names).toEqual(["SkyPanel"]);
  });
});

// ── Sorting ───────────────────────────────────────────────────────────────
describe("sorting", () => {
  it("toggleSort switches direction when clicking the same key", () => {
    const { result } = render();
    // default: name asc
    act(() => result.current.toggleSort("name"));
    expect(result.current.sortDir).toBe("desc");
    const names = result.current.sortedEquipment.map((i) => i.name);
    expect(names).toEqual(["SkyPanel", "Sandbag", "C-Stand", "Apple Box"]);
  });

  it("toggleSort changes key and resets to asc", () => {
    const { result } = render();
    act(() => result.current.toggleSort("qty"));
    expect(result.current.sortKey).toBe("qty");
    expect(result.current.sortDir).toBe("asc");
    const qtys = result.current.sortedEquipment.map((i) => i.quantity);
    expect(qtys).toEqual([2, 3, 8, 10]);
  });

  it("sortArrow returns ▲ for active asc key, ▼ for desc, empty for others", () => {
    const { result } = render();
    expect(result.current.sortArrow("name")).toBe(" ▲");
    expect(result.current.sortArrow("qty")).toBe("");
    act(() => result.current.toggleSort("name"));
    expect(result.current.sortArrow("name")).toBe(" ▼");
  });
});

// ── Pagination ────────────────────────────────────────────────────────────
describe("pagination", () => {
  it("paginates correctly with pageSize < total items", () => {
    const manyItems = Array.from({ length: 10 }, (_, i) =>
      makeItem({ id: String(i), name: `Item ${String(i).padStart(2, "0")}` }),
    );
    const { result } = renderHook(() =>
      useInventoryView({ equipment: manyItems, initialSortKey: "name" }),
    );

    act(() => result.current.setPageSize(3));
    expect(result.current.paginatedEquipment).toHaveLength(3);
    expect(result.current.totalPages).toBe(4); // ceil(10/3)

    act(() => result.current.setPage(2));
    expect(result.current.paginatedEquipment[0].name).toBe("Item 03");
  });

  it("pageSize 0 returns all items", () => {
    const { result } = render();
    act(() => result.current.setPageSize(0));
    expect(result.current.paginatedEquipment).toHaveLength(4);
    expect(result.current.totalPages).toBe(1);
  });

  it("resets to page 1 when filter changes", () => {
    const manyItems = Array.from({ length: 10 }, (_, i) =>
      makeItem({ id: String(i), name: `Item ${i}` }),
    );
    const { result } = renderHook(() =>
      useInventoryView({ equipment: manyItems }),
    );

    act(() => {
      result.current.setPageSize(3);
      result.current.setPage(2);
    });
    expect(result.current.page).toBe(2);

    act(() => result.current.setFilterStatus("Out"));
    expect(result.current.page).toBe(1);
  });
});

// ── Pinning ───────────────────────────────────────────────────────────────
describe("pinned items", () => {
  it("pinItem floats item to top regardless of sort", () => {
    const { result } = render();
    // Default sort: name asc. SkyPanel would be last.
    act(() => result.current.pinItem("3")); // SkyPanel
    expect(result.current.sortedEquipment[0].name).toBe("SkyPanel");
  });

  it("pins are cleared when filters change", () => {
    const { result } = render();
    act(() => result.current.pinItem("3"));
    expect(result.current.sortedEquipment[0].name).toBe("SkyPanel");

    act(() => result.current.setFilterLocation("G&E Truck"));
    flush();
    // SkyPanel is in G&E Truck so still visible, but pin was cleared;
    // confirm it falls back to natural sort position
    const names = result.current.sortedEquipment.map((i) => i.name);
    expect(names[0]).toBe("C-Stand"); // C-Stand < SkyPanel alphabetically
  });

  it("pins are cleared when sort changes", () => {
    const { result } = render();
    act(() => result.current.pinItem("3")); // SkyPanel pinned
    act(() => result.current.toggleSort("name")); // changes sort
    const names = result.current.sortedEquipment.map((i) => i.name);
    // After toggle (name desc): SkyPanel, Sandbag, C-Stand, Apple Box — no pinning
    expect(names[0]).toBe("SkyPanel"); // coincidentally still first, but because of sort not pin
    // Verify pin set is empty by adding a different pin and checking it doesn't jump
    act(() => result.current.pinItem("2")); // Apple Box
    const names2 = result.current.sortedEquipment.map((i) => i.name);
    expect(names2[0]).toBe("Apple Box");
  });
});

// ── totalCount ────────────────────────────────────────────────────────────
describe("totalCount", () => {
  it("reflects filtered count, not raw equipment count", () => {
    const { result } = render();
    act(() => result.current.setFilterCategory("Electric"));
    expect(result.current.totalCount).toBe(1);
  });
});
