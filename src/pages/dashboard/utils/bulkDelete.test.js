import { describe, it, expect } from "vitest";
import { bulkDeleteOutcome } from "./bulkDelete";

describe("bulkDeleteOutcome", () => {
  it("full success: clears the selection and toasts success", () => {
    const out = bulkDeleteOutcome(["a", "b"], { removedIds: ["a", "b"], notDeletedIds: [], error: null });
    expect(out.toastType).toBe("success");
    expect(out.message).toBe("Deleted 2 item(s)");
    expect(out.pruneSelection(["a", "b"])).toEqual([]);
  });

  it("partial (RLS refused one): keeps only the not-deleted ids selected", () => {
    const out = bulkDeleteOutcome(["a", "b", "c"], { removedIds: ["a", "c"], notDeletedIds: ["b"], error: null });
    expect(out.toastType).toBe("error");
    expect(out.message).toBe(
      "Deleted 2 of 3 item(s). 1 not deleted: you may not have permission to delete them.",
    );
    expect(out.pruneSelection(["a", "b", "c"])).toEqual(["b"]);
  });

  it("request error: reports the error message and keeps failed ids selected", () => {
    const out = bulkDeleteOutcome(["a", "b"], {
      removedIds: [],
      notDeletedIds: ["a", "b"],
      error: new Error("Failed to fetch"),
    });
    expect(out.message).toBe("Deleted 0 of 2 item(s). 2 not deleted: Failed to fetch.");
    expect(out.pruneSelection(["a", "b"])).toEqual(["a", "b"]);
  });
});
