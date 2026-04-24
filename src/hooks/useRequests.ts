import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../context/AuthContext';
import { canManageInventory } from '../lib/types';

const TABLE = 'equipment_requests';

export interface EquipmentRequest {
  id: string;
  org_id: string;
  requested_by: string;
  requester_name: string | null;
  item_name: string;
  quantity: number;
  notes: string | null;
  status: 'pending' | 'approved' | 'denied';
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface UseRequestsReturn {
  requests: EquipmentRequest[];
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  refresh: () => Promise<void>;
  submitRequest: (params: { itemName: string; quantity: number; notes: string }) => Promise<void>;
  reviewRequest: (requestId: string, newStatus: 'approved' | 'denied') => Promise<void>;
}

export function useRequests(): UseRequestsReturn {
  const { profile, session } = useAuthContext();
  // department_head can also approve/deny requests for their team
  const isAdmin = profile?.role != null && canManageInventory(profile.role);

  const [requests, setRequests] = useState<EquipmentRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    if (!profile?.org_id) return;
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from(TABLE)
        .select('*')
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: false });

      // Crew only see their own requests
      if (!isAdmin && session?.user.id) {
        query = query.eq('requested_by', session.user.id);
      }

      const { data, error: sbError } = await query;
      if (sbError) throw sbError;
      setRequests((data ?? []) as EquipmentRequest[]);
    } catch (e: any) {
      console.error('[useRequests] fetch failed', e);
      setError(e?.message ?? 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [profile?.org_id, isAdmin, session?.user.id]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Realtime: new inserts and updates for this org
  useEffect(() => {
    if (!profile?.org_id) return;

    const channel = supabase
      .channel(`requests-org-${profile.org_id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: TABLE, filter: `org_id=eq.${profile.org_id}` },
        (payload) => {
          const newReq = payload.new as EquipmentRequest;
          if (!isAdmin && newReq.requested_by !== session?.user.id) return;
          setRequests((prev) => {
            if (prev.some((r) => r.id === newReq.id)) return prev;
            return [newReq, ...prev];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: TABLE, filter: `org_id=eq.${profile.org_id}` },
        (payload) => {
          const updated = payload.new as EquipmentRequest;
          setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.org_id, isAdmin, session?.user.id]);

  const submitRequest = useCallback(
    async ({ itemName, quantity, notes }: { itemName: string; quantity: number; notes: string }) => {
      if (!profile?.org_id || !session?.user.id) throw new Error('Not authenticated');

      const { data, error: sbError } = await supabase
        .from(TABLE)
        .insert({
          org_id: profile.org_id,
          requested_by: session.user.id,
          requester_name: profile.full_name ?? session.user.email ?? 'Unknown',
          item_name: itemName.trim(),
          quantity: Math.max(1, quantity),
          notes: notes.trim() || null,
          status: 'pending',
        })
        .select()
        .single();

      if (sbError) throw sbError;
      setRequests((prev) => [data as EquipmentRequest, ...prev]);
    },
    [profile, session]
  );

  const reviewRequest = useCallback(
    async (requestId: string, newStatus: 'approved' | 'denied') => {
      if (!isAdmin) throw new Error('Not authorized');

      const reviewerName = profile?.full_name ?? session?.user.email ?? 'admin';
      const { data, error: sbError } = await supabase
        .from(TABLE)
        .update({ status: newStatus, reviewed_by: reviewerName, reviewed_at: new Date().toISOString() })
        .eq('id', requestId)
        .eq('org_id', profile!.org_id)
        .select()
        .single();

      if (sbError) throw sbError;
      setRequests((prev) => prev.map((r) => (r.id === requestId ? (data as EquipmentRequest) : r)));
    },
    [isAdmin, profile, session]
  );

  return { requests, loading, error, isAdmin, refresh: fetchRequests, submitRequest, reviewRequest };
}
