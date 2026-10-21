import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { useContext } from "react";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabaseClient", () => ({
  supabase: { from, rpc: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() },
}));
// EquipmentContext imports "../lib/supabaseClient" (relative) — same module.

import EquipmentContext, { EquipmentProvider } from "./EquipmentContext";
import UserContext from "./UserContext";
import { getToasts, installGlobalToast, resetToastsForTests } from "@/lib/toast";

function query(result) {
  const q = {};
  for (const m of ["delete", "select", "in", "eq", "order", "update", "insert", "single"]) {
    q[m] = vi.fn(() => q);
  }
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
}

// orgId null + teams off: the provider's initial load returns [] without a
// network call, and no realtime channel is opened.
const user = { orgId: null, loadingOrg: false, role: "owner", features: { teams_enabled: false } };

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
  act(() => {
    ctx.setEquipmentData([
      { id: "a", name: "C-Stand" },
      { id: "b", name: "Apple Box" },
      { id: "c", name: "Flag" },
    ]);
  });
  return () => ctx;
}

beforeEach(() => {
  from.mockReset();
  from.mockImplementation(() => query({ data: [], error: null }));
  installGlobalToast();
  resetToastsForTests();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("EquipmentContext.deleteEquipment (H1 interim a)", () => {
  it("throws and keeps the row when RLS silently filtered the DELETE", async () => {
    const get = await renderProvider();
    from
      .mockReturnValueOnce(query({ data: [], error: null })) // DELETE ... RETURNING id -> 0 rows
      .mockReturnValueOnce(query({ data: [{ id: "a" }], error: null })); // still there

    await expect(act(() => get().deleteEquipment("a"))).rejects.toThrow(
      "You don't have permission to delete this item.",
    );
    expect(get().equipment.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(getToasts().map((t) => t.message)).toContain("You don't have permission to delete this item.");
    expect(getToasts().map((t) => t.message)).not.toContain("Item deleted");
  });

  it("removes the row and toasts when the DELETE returned it", async () => {
    const get = await renderProvider();
    from.mockReturnValueOnce(query({ data: [{ id: "a" }], error: null }));

    await act(() => get().deleteEquipment("a"));
    expect(get().equipment.map((x) => x.id)).toEqual(["b", "c"]);
    expect(getToasts().map((t) => t.message)).toEqual(["Item deleted"]);
  });

  it("silent: no toasts", async () => {
    const get = await renderProvider();
    from.mockReturnValueOnce(query({ data: [{ id: "a" }], error: null }));

    await act(() => get().deleteEquipment("a", { silent: true }));
    expect(getToasts()).toEqual([]);
  });
});

describe("EquipmentContext.deleteEquipmentMany (L18)", () => {
  it("removes deleted + already-gone rows locally and reports the refused ones", async () => {
    const get = await renderProvider();
    from
      .mockReturnValueOnce(query({ data: [{ id: "a" }], error: null })) // only a deleted
      .mockReturnValueOnce(query({ data: [{ id: "b" }], error: null })); // b still there, c gone

    let result;
    await act(async () => {
      result = await get().deleteEquipmentMany(["a", "b", "c"]);
    });
    expect(result).toEqual({ removedIds: ["a", "c"], notDeletedIds: ["b"], error: null });
    expect(get().equipment.map((x) => x.id)).toEqual(["b"]);
  });
});
