import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useContext } from "react";

const { from, channel } = vi.hoisted(() => ({ from: vi.fn(), channel: vi.fn() }));
vi.mock("@/lib/supabaseClient", () => ({
  supabase: { from, channel, removeChannel: vi.fn(), rpc: vi.fn() },
}));
// EquipmentContext imports "../lib/supabaseClient" (relative) — same module.

import EquipmentContext, { EquipmentProvider } from "./EquipmentContext";
import UserContext from "./UserContext";

// Thenable query builder that records every chained call.
function query(result, calls) {
  const q = {};
  for (const m of ["select", "eq", "in", "order", "range", "insert", "update", "delete", "single"]) {
    q[m] = vi.fn((...args) => {
      calls.push([m, ...args]);
      return q;
    });
  }
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
}

const rows = (n, offset = 0) =>
  Array.from({ length: n }, (_, i) => ({
    id: `id-${offset + i}`,
    name: `Item ${offset + i}`,
    quantity: 1,
    location: "Truck",
  }));

// Teams off + orgId set: the provider loads the whole org pool.
const user = { orgId: "org-1", loadingOrg: false, role: "owner", features: { teams_enabled: false } };

async function renderProvider() {
  let ctx;
  const Probe = () => {
    ctx = useContext(EquipmentContext);
    return null;
  };
  render(
    <UserContext.Provider value={user}>
      <EquipmentProvider>
        <Probe />
      </EquipmentProvider>
    </UserContext.Provider>,
  );
  await waitFor(() => expect(ctx.loadingEquipment).toBe(false));
  return () => ctx;
}

let equipmentCalls;
let pages;

beforeEach(() => {
  equipmentCalls = [];
  pages = [];
  from.mockReset();
  from.mockImplementation((table) => {
    if (table === "equipment_items") {
      const calls = [];
      equipmentCalls.push(calls);
      return query({ data: pages.shift() ?? [], error: null }, calls);
    }
    return query({ data: [], error: null }, []);
  });
  const ch = { on: vi.fn(() => ch), subscribe: vi.fn(() => ch) };
  channel.mockReset();
  channel.mockReturnValue(ch);
});

describe("EquipmentContext inventory load (L9)", () => {
  it("pages past PostgREST's 1000-row cap", async () => {
    pages = [rows(1000), rows(5, 1000)];
    const get = await renderProvider();

    expect(get().equipment).toHaveLength(1005);
    expect(equipmentCalls).toHaveLength(2);
    const ranges = equipmentCalls.map((calls) => calls.find((c) => c[0] === "range"));
    expect(ranges).toEqual([
      ["range", 0, 999],
      ["range", 1000, 1999],
    ]);
    // Stable order across pages: created_at desc, then id
    expect(equipmentCalls[0].filter((c) => c[0] === "order")).toEqual([
      ["order", "created_at", { ascending: false }],
      ["order", "id", { ascending: true }],
    ]);
    expect(equipmentCalls[0]).toContainEqual(["eq", "org_id", "org-1"]);
  });

  it("stops after one request when the first page is short", async () => {
    pages = [rows(3)];
    const get = await renderProvider();
    expect(get().equipment).toHaveLength(3);
    expect(equipmentCalls).toHaveLength(1);
  });
});
