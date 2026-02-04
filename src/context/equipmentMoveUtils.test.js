import { describe, it, expect } from "vitest";
import { isSameItemForMerge, findMergeDestination } from "./equipmentMoveUtils";

describe("equipmentMoveUtils", () => {
  const base = {
    id: "a",
    itemId: "X1",
    name: "C-Stand",
    category: "Stands",
    source: "Dean",
    status: "Available",
    rentalStart: "2026-02-01",
    rentalEnd: "2026-02-10",
    location: "G1",
    quantity: 5,
  };

  it("isSameItemForMerge returns true when all merge-defining fields match", () => {
    expect(isSameItemForMerge(base, { ...base, id: "b", location: "G2" })).toBe(
      true,
    );
  });

  it("isSameItemForMerge returns false if status differs", () => {
    expect(isSameItemForMerge(base, { ...base, status: "Out" })).toBe(false);
  });

  it("isSameItemForMerge returns false if source differs", () => {
    expect(isSameItemForMerge(base, { ...base, source: "Whites" })).toBe(false);
  });

  it("isSameItemForMerge returns false if dates differ", () => {
    expect(isSameItemForMerge(base, { ...base, rentalEnd: "2026-02-11" })).toBe(
      false,
    );
  });

  it("findMergeDestination finds a destination row in the target location with matching identity", () => {
    const equipment = [
      base,
      { ...base, id: "dest", location: "G2", quantity: 2 },
      { ...base, id: "other", location: "G2", status: "Out" }, // should NOT match
    ];

    const dest = findMergeDestination({
      equipment,
      currentId: "a",
      newLocation: "G2",
      current: base,
    });

    expect(dest?.id).toBe("dest");
  });

  it("findMergeDestination returns undefined if only the same row matches (never merge into itself)", () => {
    const equipment = [{ ...base, location: "G2" }];

    const dest = findMergeDestination({
      equipment,
      currentId: "a",
      newLocation: "G2",
      current: base,
    });

    expect(dest).toBe(undefined);
  });

  it("findMergeDestination returns undefined when newLocation is the same as current.location", () => {
    const equipment = [
      base,
      { ...base, id: "dest", location: "G1", quantity: 2 }, // same location
    ];

    const dest = findMergeDestination({
      equipment,
      currentId: "a",
      newLocation: "G1",
      current: base,
    });

    expect(dest).toBe(undefined);
  });

  it("findMergeDestination returns undefined if no matching identity exists in the target location", () => {
    const equipment = [
      base,
      { ...base, id: "dest", location: "G2", name: "Apple Box" }, // name differs
    ];

    const dest = findMergeDestination({
      equipment,
      currentId: "a",
      newLocation: "G2",
      current: base,
    });

    expect(dest).toBe(undefined);
  });

  it("isSameItemForMerge returns false if itemId differs (even if name matches)", () => {
    expect(isSameItemForMerge(base, { ...base, itemId: "X2" })).toBe(false);
  });
});
