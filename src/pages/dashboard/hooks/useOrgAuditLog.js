import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

const AUDIT_TABLE =
  import.meta.env.VITE_EQUIPMENT_AUDIT_TABLE || "equipment_audit";

// Cap the on-screen table — owners wanting the full untruncated set should use
// the CSV export (fetchAndDownloadAuditCsv), which already handles up to 10k rows.
export const ROW_CAP = 500;

/**
 * Fetches org-wide audit events (every item, every action) for the Settings
 * "Full History" table, with a date-range and action-type filter.
 *
 * @param {object} opts
 * @param {string|null} opts.orgId
 * @param {number|null} opts.days   - lookback window in days, or null for all time
 * @param {string} opts.action      - "all" or a specific equipment_audit.action value
 * @returns {{ logs, total, truncated, loading, error, refresh }}
 */
export default function useOrgAuditLog({ orgId, days, action = "all" }) {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchLogs = useCallback(async () => {
    if (!orgId) {
      setLogs([]);
      setTotal(0);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from(AUDIT_TABLE)
        .select("*", { count: "exact" })
        .eq("org_id", orgId);

      if (days) {
        const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte("at", sinceIso);
      }

      if (action && action !== "all") {
        query = query.eq("action", action);
      }

      const { data, error: sbError, count } = await query
        .order("at", { ascending: false })
        .range(0, ROW_CAP - 1);

      if (sbError) throw sbError;
      setLogs(data || []);
      setTotal(count ?? (data || []).length);
    } catch (e) {
      console.error("[useOrgAuditLog] fetch failed", e);
      setError(e?.message || "Failed to load history");
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [orgId, days, action]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return {
    logs,
    total,
    truncated: total > ROW_CAP,
    loading,
    error,
    refresh: fetchLogs,
  };
}
