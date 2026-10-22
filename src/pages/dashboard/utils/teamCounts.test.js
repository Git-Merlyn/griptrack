import { describe, it, expect, vi } from "vitest";
import { fetchTeamItemCounts } from "./teamCounts";

function fakeSupabase(byTeam) {
  const calls = [];
  const from = vi.fn((table) => {
    const call = { table };
    calls.push(call);
    const q = {
      select: vi.fn((cols, opts) => {
        call.cols = cols;
        call.opts = opts;
        return q;
      }),
      eq: vi.fn((col, val) => {
        call.eq = [col, val];
        return Promise.resolve(byTeam[val]);
      }),
    };
    return q;
  });
  return { supabase: { from }, calls };
}

describe("fetchTeamItemCounts (L9)", () => {
  it("uses one exact HEAD count per team and returns counts above 1000", async () => {
    const { supabase, calls } = fakeSupabase({
      t1: { count: 1500, error: null },
      t2: { count: 0, error: null },
    });
    const counts = await fetchTeamItemCounts(supabase, ["t1", "t2"]);
    expect(counts).toEqual({ t1: 1500, t2: 0 });
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.table).toBe("equipment_items");
      expect(c.opts).toEqual({ count: "exact", head: true });
    }
    expect(calls.map((c) => c.eq)).toEqual([
      ["team_id", "t1"],
      ["team_id", "t2"],
    ]);
  });

  it("leaves out teams whose count failed", async () => {
    const { supabase } = fakeSupabase({
      t1: { count: null, error: { message: "boom" } },
      t2: { count: 7, error: null },
    });
    expect(await fetchTeamItemCounts(supabase, ["t1", "t2"])).toEqual({ t2: 7 });
  });

  it("returns {} for no teams without querying", async () => {
    const { supabase, calls } = fakeSupabase({});
    expect(await fetchTeamItemCounts(supabase, [])).toEqual({});
    expect(calls).toHaveLength(0);
  });
});
