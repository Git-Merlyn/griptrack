import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import React from "react";
import UserContext from "@/context/UserContext";

// ── Supabase mock ─────────────────────────────────────────────────────────
const mockLimit = vi.fn();
const mockOrder = vi.fn().mockReturnThis();

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      order:  mockOrder,
      limit:  mockLimit,
    })),
  },
}));

import useAuditLog from "./useAuditLog";

// ── Helpers ───────────────────────────────────────────────────────────────
// Provide UserContext via a React wrapper so we don't have to mock useContext.
const wrapper = ({ children }) =>
  React.createElement(
    UserContext.Provider,
    { value: { orgId: "org-1" } },
    children,
  );

const wrapperNoOrg = ({ children }) =>
  React.createElement(
    UserContext.Provider,
    { value: { orgId: null } },
    children,
  );

const FAKE_LOGS = [
  { id: "a1", equipment_id: "eq-1", org_id: "org-1", action: "move",   actor: "admin", at: "2025-01-01T10:00:00Z" },
  { id: "a2", equipment_id: "eq-1", org_id: "org-1", action: "update", actor: "admin", at: "2025-01-02T10:00:00Z" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockLimit.mockResolvedValue({ data: FAKE_LOGS, error: null });
});

// ── Tests ─────────────────────────────────────────────────────────────────
describe("useAuditLog", () => {
  it("starts loading and returns empty logs before fetch resolves", () => {
    mockLimit.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useAuditLog("eq-1"), { wrapper });
    expect(result.current.logs).toEqual([]);
    expect(result.current.loading).toBe(true);
  });

  it("populates logs after a successful fetch", async () => {
    const { result } = renderHook(() => useAuditLog("eq-1"), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.logs).toEqual(FAKE_LOGS);
    expect(result.current.error).toBeNull();
  });

  it("orders by the real timestamp column ('at', not 'created_at')", async () => {
    // equipment_audit's timestamp column is named "at" — ordering by a
    // nonexistent "created_at" throws at the DB and breaks History entirely.
    const { result } = renderHook(() => useAuditLog("eq-1"), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockOrder).toHaveBeenCalledWith("at", { ascending: false });
  });

  it("sets error and returns empty logs when fetch fails", async () => {
    mockLimit.mockResolvedValue({ data: null, error: { message: "DB error" } });
    const { result } = renderHook(() => useAuditLog("eq-1"), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.logs).toEqual([]);
    expect(result.current.error).toBe("DB error");
  });

  it("skips fetch when equipmentId is null", async () => {
    const { result } = renderHook(() => useAuditLog(null), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.logs).toEqual([]);
    expect(mockLimit).not.toHaveBeenCalled();
  });

  it("skips fetch when orgId is null", async () => {
    const { result } = renderHook(() => useAuditLog("eq-1"), { wrapper: wrapperNoOrg });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.logs).toEqual([]);
    expect(mockLimit).not.toHaveBeenCalled();
  });

  it("re-fetches when equipmentId changes", async () => {
    const { result, rerender } = renderHook(
      ({ id }) => useAuditLog(id),
      { wrapper, initialProps: { id: "eq-1" } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockLimit).toHaveBeenCalledTimes(1);

    rerender({ id: "eq-2" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockLimit).toHaveBeenCalledTimes(2);
  });

  it("refresh() re-fetches and updates logs", async () => {
    const { result } = renderHook(() => useAuditLog("eq-1"), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockLimit).toHaveBeenCalledTimes(1);

    const newLogs = [{ id: "a3", equipment_id: "eq-1", action: "delete" }];
    mockLimit.mockResolvedValue({ data: newLogs, error: null });

    await act(async () => { await result.current.refresh(); });
    expect(result.current.logs).toEqual(newLogs);
    expect(mockLimit).toHaveBeenCalledTimes(2);
  });
});
