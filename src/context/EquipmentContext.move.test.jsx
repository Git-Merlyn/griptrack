import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import React, { useContext } from "react";

// ── Supabase mock ─────────────────────────────────────────────────────────
// Every query-builder method returns the same thenable chain; awaiting it
// yields the table's canned result. Writes are spies so tests can assert the
// move never falls back to direct table writes.
const h = vi.hoisted(() => ({
  rows: [],
  rpc: null,
  update: null,
  insert: null,
  del: null,
}));

vi.mock("@/lib/supabaseClient", () => {
  h.rpc = vi.fn();
  h.update = vi.fn();
  h.insert = vi.fn();
  h.del = vi.fn();
  const chain = (result) => {
    const c = {};
    for (const m of ["select", "eq", "order", "single", "in"]) c[m] = vi.fn(() => c);
    c.update = (...a) => { h.update(...a); return c; };
    c.insert = (...a) => { h.insert(...a); return c; };
    c.delete = (...a) => { h.del(...a); return c; };
    c.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
    return c;
  };
  const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
  return {
    supabase: {
      from: vi.fn((table) =>
        chain(table === "equipment_items" ? { data: h.rows, error: null } : { data: [], error: null }),
      ),
      rpc: (...a) => h.rpc(...a),
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    },
  };
});

import EquipmentContext, { EquipmentProvider } from "./EquipmentContext";
import UserContext from "./UserContext";
import TeamContext from "./TeamContext";

const dbRow = (over = {}) => ({
  id: "src",
  org_id: "org-1",
  team_id: "team-1",
  item_id: null,
  name: "C-Stand",
  category: "Grip",
  source: "House",
  quantity: 5,
  reserve_min: 0,
  location: "Truck 1",
  status: "Available",
  start_date: null,
  end_date: null,
  updated_by: "alice",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  ...over,
});

const wrapper = ({ children }) =>
  React.createElement(
    UserContext.Provider,
    {
      value: {
        orgId: "org-1",
        loadingOrg: false,
        role: "crew",
        teamId: "team-1",
        features: { teams_enabled: true },
      },
    },
    React.createElement(
      TeamContext.Provider,
      { value: { activeTeamId: null } },
      React.createElement(EquipmentProvider, null, children),
    ),
  );

async function setup(rows) {
  h.rows = rows;
  const view = renderHook(() => useContext(EquipmentContext), { wrapper });
  await waitFor(() => expect(view.result.current.loadingEquipment).toBe(false));
  await waitFor(() => expect(view.result.current.equipment).toHaveLength(rows.length));
  return view;
}

const qtyOf = (result, id) => result.current.equipment.find((x) => x.id === id)?.quantity;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EquipmentContext.moveEquipment (move_equipment RPC)", () => {
  it("partial move: one RPC call, no direct table writes, state takes the server rows", async () => {
    const { result } = await setup([dbRow()]);
    h.rpc.mockResolvedValueOnce({
      data: {
        status: "applied", kind: "split", requested_qty: 2, moved_qty: 2,
        source_id: "src", dest_id: "new",
        source: dbRow({ quantity: 3 }),
        dest: dbRow({ id: "new", quantity: 2, location: "Truck 2" }),
      },
      error: null,
    });

    await act(() => result.current.moveEquipment("src", 2, "Truck 2", "Alice"));

    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.rpc).toHaveBeenCalledWith("move_equipment", {
      p_source: "src", p_qty: 2, p_to_location: "Truck 2", p_updated_by: "Alice",
    });
    expect(h.update).not.toHaveBeenCalled();
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.del).not.toHaveBeenCalled();
    expect(qtyOf(result, "src")).toBe(3);
    expect(qtyOf(result, "new")).toBe(2);
  });

  it("full merge: source disappears, destination takes the summed quantity", async () => {
    const { result } = await setup([dbRow(), dbRow({ id: "dst", location: "Truck 2", quantity: 3 })]);
    h.rpc.mockResolvedValueOnce({
      data: {
        status: "applied", kind: "merge", requested_qty: 5, moved_qty: 5,
        source_id: "src", dest_id: "dst",
        source: null,
        dest: dbRow({ id: "dst", location: "Truck 2", quantity: 8 }),
      },
      error: null,
    });

    await act(() => result.current.moveEquipment("src", 5, "Truck 2", "Alice"));

    expect(result.current.equipment.map((x) => x.id)).toEqual(["dst"]);
    expect(qtyOf(result, "dst")).toBe(8);
    expect(h.del).not.toHaveBeenCalled();
  });

  it("whole-row move (qty null) sends p_qty null", async () => {
    const { result } = await setup([dbRow({ quantity: 0, reserve_min: 2 })]);
    h.rpc.mockResolvedValueOnce({
      data: {
        status: "applied", kind: "relocate", requested_qty: null, moved_qty: 0,
        source_id: "src", dest_id: "src",
        source: dbRow({ quantity: 0, reserve_min: 2, location: "Truck 2" }),
        dest: dbRow({ quantity: 0, reserve_min: 2, location: "Truck 2" }),
      },
      error: null,
    });

    await act(() => result.current.moveEquipment("src", null, "Truck 2", "Alice", { silent: true }));

    expect(h.rpc.mock.calls[0][1].p_qty).toBeNull();
    expect(result.current.equipment[0].location).toBe("Truck 2");
    expect(qtyOf(result, "src")).toBe(0);
  });

  it("server rejection (e.g. 42501): throws and leaves state unchanged", async () => {
    const { result } = await setup([dbRow()]);
    h.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not allowed to move this item" } });

    await expect(
      act(() => result.current.moveEquipment("src", 2, "Truck 2", "Alice")),
    ).rejects.toMatchObject({ message: "not allowed to move this item" });

    expect(qtyOf(result, "src")).toBe(5);
    expect(result.current.equipment).toHaveLength(1);
  });

  it("D22: destination that is not an existing location (22023): readable error, state unchanged", async () => {
    const { result } = await setup([dbRow()]);
    h.rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "22023",
        message: "destination must be an existing location",
        hint: "Only owners, admins and department heads can add locations.",
      },
    });

    await expect(
      act(() => result.current.moveEquipment("src", 2, "My Van", "Alice")),
    ).rejects.toThrow(`"My Van" is not one of your organization's locations.`);

    expect(qtyOf(result, "src")).toBe(5);
    expect(result.current.equipment).toHaveLength(1);
  });

  it("same-location noop: throws a readable error", async () => {
    const { result } = await setup([dbRow()]);
    h.rpc.mockResolvedValueOnce({
      data: { status: "applied", kind: "noop", reason: "same_location", requested_qty: 1, moved_qty: 0,
              source_id: "src", dest_id: null, source: dbRow(), dest: null },
      error: null,
    });

    await expect(
      act(() => result.current.moveEquipment("src", 1, "Truck 1", "Alice")),
    ).rejects.toThrow("Item is already at that location");
  });

  it("rejects bad input without calling the server", async () => {
    const { result } = await setup([dbRow()]);
    await expect(result.current.moveEquipment("src", 0, "Truck 2")).rejects.toThrow("Quantity must be at least 1");
    await expect(result.current.moveEquipment("src", 1, "  ")).rejects.toThrow("Choose a destination location");
    expect(h.rpc).not.toHaveBeenCalled();
  });
});
