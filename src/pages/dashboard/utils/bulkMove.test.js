import { describe, it, expect, vi } from "vitest";
import { bulkMoveToLocation } from "./bulkMove";

const rows = [
  { id: "a", name: "C-Stand", location: "Truck 1", quantity: 0, reserveMin: 2 },
  { id: "b", name: "Apple Box", location: "Stage A", quantity: 4 },
  { id: "c", name: "Sandbag", location: "Truck 2", quantity: 3 },
];

describe("bulkMoveToLocation", () => {
  it("moves each row whole (qty null, silent) and skips rows already there", async () => {
    const moveEquipment = vi.fn().mockResolvedValue({ status: "applied" });

    const result = await bulkMoveToLocation({
      ids: ["a", "b", "c"], equipment: rows, location: "Stage A", actor: "Alice", moveEquipment,
    });

    expect(result).toEqual({ moved: 2, skipped: 1, failed: [] });
    expect(moveEquipment.mock.calls).toEqual([
      ["a", null, "Stage A", "Alice", { silent: true }],
      ["c", null, "Stage A", "Alice", { silent: true }],
    ]);
  });

  it("never sends a quantity (a quantity-0 row is not bumped to 1)", async () => {
    const moveEquipment = vi.fn().mockResolvedValue({});
    await bulkMoveToLocation({ ids: ["a"], equipment: rows, location: "Stage B", actor: "Alice", moveEquipment });
    expect(moveEquipment.mock.calls[0][1]).toBeNull();
  });

  it("runs moves one at a time, in selection order", async () => {
    const order = [];
    let inFlight = 0;
    const moveEquipment = vi.fn(async (id) => {
      inFlight++;
      expect(inFlight).toBe(1);
      await new Promise((r) => setTimeout(r, 5));
      order.push(id);
      inFlight--;
    });

    await bulkMoveToLocation({ ids: ["c", "a"], equipment: rows, location: "Stage B", actor: "x", moveEquipment });
    expect(order).toEqual(["c", "a"]);
  });

  it("keeps going after a failure and reports it", async () => {
    const moveEquipment = vi.fn()
      .mockRejectedValueOnce(new Error("not allowed to move this item"))
      .mockResolvedValueOnce({});

    const result = await bulkMoveToLocation({
      ids: ["a", "c"], equipment: rows, location: "Stage B", actor: "x", moveEquipment,
    });

    expect(result.moved).toBe(1);
    expect(result.failed).toEqual([{ id: "a", name: "C-Stand", message: "not allowed to move this item" }]);
  });

  it("skips ids that are not loaded", async () => {
    const moveEquipment = vi.fn();
    const result = await bulkMoveToLocation({ ids: ["zzz"], equipment: rows, location: "X", actor: "x", moveEquipment });
    expect(result).toEqual({ moved: 0, skipped: 1, failed: [] });
    expect(moveEquipment).not.toHaveBeenCalled();
  });
});
