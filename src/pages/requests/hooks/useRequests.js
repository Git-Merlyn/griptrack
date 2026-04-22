import { useState, useEffect, useCallback, useContext } from "react";
import { supabase } from "@/lib/supabaseClient";
import UserContext from "@/context/UserContext";

const TABLE = "equipment_requests";

/**
 * Manages equipment requests for the current org.
 *
 * Admins/owners see all requests; crew see only their own.
 */
export default function useRequests() {
  const { orgId, role, profile, authUser } = useContext(UserContext) || {};
  const isAdmin = role === "owner" || role === "admin";

  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchRequests = useCallback(async () => {
    if (!orgId) return;

    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from(TABLE)
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      // Crew only see their own requests
      if (!isAdmin && authUser?.id) {
        query = query.eq("requested_by", authUser.id);
      }

      const { data, error: sbError } = await query;
      if (sbError) throw sbError;
      setRequests(data || []);
    } catch (e) {
      console.error("[useRequests] fetch failed", e);
      setError(e?.message || "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, [orgId, isAdmin, authUser?.id]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // ── Realtime subscription for equipment_requests ───────────────────────────
  // Broadcasts new and updated requests to all org members in real time.
  //
  // One-time setup required (run once in Supabase SQL editor):
  //   alter publication supabase_realtime add table equipment_requests;
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`requests-org-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: TABLE,
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          const newReq = payload.new;
          // Crew only see their own requests
          if (!isAdmin && newReq.requested_by !== authUser?.id) return;
          setRequests((prev) => {
            if (prev.some((r) => r.id === newReq.id)) return prev;
            return [newReq, ...prev];
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: TABLE,
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          const updated = payload.new;
          setRequests((prev) =>
            prev.map((r) => (r.id === updated.id ? updated : r)),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, isAdmin, authUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Submit a new request (crew) ────────────────────────────────────────────

  const submitRequest = useCallback(async ({ itemName, quantity, notes }) => {
    if (!orgId || !authUser?.id) throw new Error("Not authenticated");

    const { data, error: sbError } = await supabase
      .from(TABLE)
      .insert({
        org_id:         orgId,
        requested_by:   authUser.id,
        requester_name: profile?.full_name || authUser.email || "Unknown",
        item_name:      String(itemName || "").trim(),
        quantity:       Math.max(1, Number(quantity) || 1),
        notes:          String(notes || "").trim() || null,
        status:         "pending",
      })
      .select()
      .single();

    if (sbError) throw sbError;

    setRequests((prev) => [data, ...prev]);
    return data;
  }, [orgId, authUser, profile]);

  // ── Review a request (admin/owner only) ───────────────────────────────────

  const reviewRequest = useCallback(async (requestId, newStatus) => {
    if (!isAdmin) throw new Error("Not authorized");
    if (!["approved", "denied"].includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    const reviewerName = profile?.full_name || authUser?.email || "admin";

    const { data, error: sbError } = await supabase
      .from(TABLE)
      .update({
        status:      newStatus,
        reviewed_by: reviewerName,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("org_id", orgId)
      .select()
      .single();

    if (sbError) throw sbError;

    setRequests((prev) =>
      prev.map((r) => (r.id === requestId ? data : r))
    );
    return data;
  }, [isAdmin, orgId, profile, authUser]);

  return {
    requests,
    loading,
    error,
    isAdmin,
    refresh: fetchRequests,
    submitRequest,
    reviewRequest,
  };
}
