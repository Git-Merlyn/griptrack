import { describe, it, expect, vi, beforeEach } from "vitest";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabaseClient", () => ({ supabase: { from } }));

import { deleteByIds } from "./deleteRows";

// A PostgREST-like builder: every method returns the builder, awaiting it
// resolves to `result`. Records calls for assertions.
function query(result) {
  const q = { calls: [] };
  for (const m of ["delete", "select", "in", "eq"]) {
    q[m] = vi.fn((...args) => {
      q.calls.push([m, ...args]);
      return q;
    });
  }
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
}

beforeEach(() => from.mockReset());

describe("deleteByIds", () => {
  it("reports rows returned by DELETE ... RETURNING id as deleted (one request)", async () => {
    const del = query({ data: [{ id: "a" }, { id: "b" }], error: null });
    from.mockReturnValueOnce(del);

    const out = await deleteByIds("equipment_items", ["a", "b"]);

    expect(out).toEqual({ deleted: ["a", "b"], gone: [], denied: [], failed: [], error: null });
    expect(from).toHaveBeenCalledTimes(1);
    expect(del.calls).toEqual([["delete"], ["in", "id", ["a", "b"]], ["select", "id"]]);
  });

  it("classifies an RLS-filtered 0-row delete as denied when the row is still there", async () => {
    from
      .mockReturnValueOnce(query({ data: [], error: null })) // DELETE: 204-equivalent, zero rows
      .mockReturnValueOnce(query({ data: [{ id: "a" }], error: null })); // re-read: still exists

    const out = await deleteByIds("equipment_items", ["a"]);
    expect(out.denied).toEqual(["a"]);
    expect(out.deleted).toEqual([]);
    expect(out.gone).toEqual([]);
  });

  it("classifies a 0-row delete of an already-deleted row as gone", async () => {
    from
      .mockReturnValueOnce(query({ data: [], error: null }))
      .mockReturnValueOnce(query({ data: [], error: null }));

    const out = await deleteByIds("teams", ["t1"]);
    expect(out.gone).toEqual(["t1"]);
    expect(out.denied).toEqual([]);
  });

  it("splits a mixed batch into deleted / denied / gone", async () => {
    from
      .mockReturnValueOnce(query({ data: [{ id: "a" }], error: null }))
      .mockReturnValueOnce(query({ data: [{ id: "b" }], error: null }));

    const out = await deleteByIds("equipment_items", ["a", "b", "c"]);
    expect(out).toMatchObject({ deleted: ["a"], denied: ["b"], gone: ["c"], failed: [] });
  });

  it("returns request errors in `error`/`failed` instead of throwing", async () => {
    const err = { message: "permission denied", code: "42501" };
    from.mockReturnValueOnce(query({ data: null, error: err }));

    const out = await deleteByIds("equipment_items", ["a", "b"]);
    expect(out.error).toBe(err);
    expect(out.failed).toEqual(["a", "b"]);
    expect(out.deleted).toEqual([]);
  });

  it("chunks large batches (100 ids per request) and keeps earlier chunks' results on a later failure", async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `id${i}`);
    const first = ids.slice(0, 100).map((id) => ({ id }));
    from
      .mockReturnValueOnce(query({ data: first, error: null }))
      .mockReturnValueOnce(query({ data: null, error: { message: "timeout" } }));

    const out = await deleteByIds("equipment_items", ids);
    expect(out.deleted).toHaveLength(100);
    expect(out.failed).toEqual(ids.slice(100));
    expect(out.error).toEqual({ message: "timeout" });
  });

  it("dedupes, drops empty ids and does nothing for an empty list", async () => {
    const out = await deleteByIds("equipment_items", [null, "", undefined]);
    expect(out).toEqual({ deleted: [], gone: [], denied: [], failed: [], error: null });
    expect(from).not.toHaveBeenCalled();
  });
});
