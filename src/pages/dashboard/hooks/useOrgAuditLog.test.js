import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// ── Supabase mock ─────────────────────────────────────────────────────────
// Chainable: every method (except the terminal .range()) returns the same
// object so calls can be composed in any order the hook uses.
const calls = {};
let resolvedValue = { data: [], error: null, count: 0 };

function makeQuery() {
  const q = {};
  ["select", "eq", "gte", "order"].forEach((m) => {
    q[m] = vi.fn((...args) => {
      calls[m] = calls[m] || [];
      calls[m].push(args);
      return q;
    });
  });
  q.range = vi.fn((...args) => {
    calls.range = calls.range || [];
    calls.range.push(args);
    return Promise.resolve(resolvedValue);
  });
  return q;
}

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { from: vi.fn(() => makeQuery()) },
}));

import useOrgAuditLog, { ROW_CAP } from "./useOrgAuditLog";

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(calls).forEach((k) => delete calls[k]);
  resolvedValue = { data: [], error: null, count: 0 };
});

describe("useOrgAuditLog", () => {
  it("skips fetching when orgId is missing", async () => {
    const { result } = renderHook(() => useOrgAuditLog({ orgId: null, days: 30, action: "all" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.logs).toEqual([]);
    expect(calls.eq).toBeUndefined();
  });

  it("scopes to the org and orders by the real timestamp column ('at')", async () => {
    renderHook(() => useOrgAuditLog({ orgId: "org-1", days: 30, action: "all" }));
    await waitFor(() => expect(calls.order).toBeDefined());
    expect(calls.eq[0]).toEqual(["org_id", "org-1"]);
    expect(calls.order[0]).toEqual(["at", { ascending: false }]);
  });

  it("applies a gte('at', ...) date filter for a numeric range", async () => {
    renderHook(() => useOrgAuditLog({ orgId: "org-1", days: 30, action: "all" }));
    await waitFor(() => expect(calls.gte).toBeDefined());
    const [col, iso] = calls.gte[0];
    expect(col).toBe("at");
    // Roughly 30 days back from "now" — allow slack for test execution time.
    const deltaMs = Date.now() - new Date(iso).getTime();
    expect(deltaMs).toBeGreaterThan(29 * 86400000);
    expect(deltaMs).toBeLessThan(31 * 86400000);
  });

  it("omits the date filter entirely for 'all time' (days = null)", async () => {
    renderHook(() => useOrgAuditLog({ orgId: "org-1", days: null, action: "all" }));
    await waitFor(() => expect(calls.order).toBeDefined());
    expect(calls.gte).toBeUndefined();
  });

  it("does not filter by action when action is 'all'", async () => {
    renderHook(() => useOrgAuditLog({ orgId: "org-1", days: 30, action: "all" }));
    await waitFor(() => expect(calls.order).toBeDefined());
    // Only org_id should have been filtered via .eq — no second .eq for action.
    expect(calls.eq).toHaveLength(1);
  });

  it("filters by action when a specific action is given", async () => {
    renderHook(() => useOrgAuditLog({ orgId: "org-1", days: 30, action: "move" }));
    await waitFor(() => expect(calls.order).toBeDefined());
    expect(calls.eq).toHaveLength(2);
    expect(calls.eq[1]).toEqual(["action", "move"]);
  });

  it("caps the range at ROW_CAP", async () => {
    renderHook(() => useOrgAuditLog({ orgId: "org-1", days: 30, action: "all" }));
    await waitFor(() => expect(calls.range).toBeDefined());
    expect(calls.range[0]).toEqual([0, ROW_CAP - 1]);
  });

  it("reports truncated=true when the exact count exceeds ROW_CAP", async () => {
    resolvedValue = { data: new Array(ROW_CAP).fill({ id: "x" }), error: null, count: ROW_CAP + 50 };
    const { result } = renderHook(() => useOrgAuditLog({ orgId: "org-1", days: 30, action: "all" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.total).toBe(ROW_CAP + 50);
    expect(result.current.truncated).toBe(true);
  });

  it("reports truncated=false when everything fits", async () => {
    resolvedValue = { data: [{ id: "x" }], error: null, count: 1 };
    const { result } = renderHook(() => useOrgAuditLog({ orgId: "org-1", days: 30, action: "all" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.truncated).toBe(false);
  });

  it("surfaces an error and clears logs on failure", async () => {
    resolvedValue = { data: null, error: { message: "DB error" }, count: null };
    const { result } = renderHook(() => useOrgAuditLog({ orgId: "org-1", days: 30, action: "all" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("DB error");
    expect(result.current.logs).toEqual([]);
  });

  it("re-fetches when the date range or action filter changes", async () => {
    const { rerender } = renderHook(
      ({ days, action }) => useOrgAuditLog({ orgId: "org-1", days, action }),
      { initialProps: { days: 30, action: "all" } },
    );
    await waitFor(() => expect(calls.range).toHaveLength(1));

    rerender({ days: 90, action: "delete" });
    await waitFor(() => expect(calls.range).toHaveLength(2));
  });
});
