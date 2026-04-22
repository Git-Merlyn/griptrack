import { useState, useEffect, useCallback, useContext } from "react";
import { supabase } from "@/lib/supabaseClient";
import UserContext from "@/context/UserContext";

const AUDIT_TABLE =
  import.meta.env.VITE_EQUIPMENT_AUDIT_TABLE || "equipment_audit";

/**
 * Fetches audit log events for a single equipment item.
 *
 * @param {string|null} equipmentId - The equipment_items.id to fetch history for.
 *   Pass null/undefined to skip fetching (e.g. when the panel is not visible).
 * @returns {{ logs, loading, error, refresh }}
 */
export default function useAuditLog(equipmentId) {
  const { orgId } = useContext(UserContext) || {};

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchLogs = useCallback(async () => {
    if (!equipmentId || !orgId) {
      setLogs([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: sbError } = await supabase
        .from(AUDIT_TABLE)
        .select("*")
        .eq("equipment_id", String(equipmentId))
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (sbError) throw sbError;
      setLogs(data || []);
    } catch (e) {
      console.error("[useAuditLog] fetch failed", e);
      setError(e?.message || "Failed to load history");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [equipmentId, orgId]);

  // Fetch whenever the target item changes
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return { logs, loading, error, refresh: fetchLogs };
}
