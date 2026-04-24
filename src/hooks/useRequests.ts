import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../context/AuthContext';
import { useSyncContext } from '../context/SyncContext';
import { canManageInventory } from '../lib/types';
import {
  upsertRequest,
  getRequestsForOrg,
  getRequestsForUser,
  enqueueOp,
  generateId,
} from '../lib/db';

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
  const { isOnline, localVersion, bumpLocalVersion, triggerSync } = useSyncContext();
  const isAdmin = profile?.role != null && canManageInventory(profile.role);

  const [requests, setRequests] = useState<EquipmentRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Read from SQLite ─────────────────────────────────────────────────────

  const loadFromDB = useCallback(() => {
    if (!profile?.org_id || !session?.user.id) return;
    try {
      const rows = isAdmin
        ? getRequestsForOrg(profile.org_id)
        : getRequestsForUser(profile.org_id, session.user.id);
      setRequests(rows);
      setError(null);
    } catch (e: any) {
      console.error('[useRequests] SQLite read failed', e);
      setError(e?.message ?? 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [profile?.org_id, session?.user.id, isAdmin]);

  useEffect(() => {
    loadFromDB();
  }, [loadFromDB, localVersion]);

  // ─── Realtime (online only) — patch SQLite + bump version on changes ──────

  useEffect(() => {
    if (!profile?.org_id || !isOnline) return;

    const channel = supabase
      .channel(`requests-org-${profile.org_id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: TABLE, filter: `org_id=eq.${profile.org_id}` },
        (payload) => {
          const newReq = payload.new as EquipmentRequest;
          if (!isAdmin && newReq.requested_by !== session?.user.id) return;
          upsertRequest(newReq);
          bumpLocalVersion();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: TABLE, filter: `org_id=eq.${profile.org_id}` },
        (payload) => {
          upsertRequest(payload.new as EquipmentRequest);
          bumpLocalVersion();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.org_id, isAdmin, session?.user.id, isOnline, bumpLocalVersion]);

  // ─── Submit request ───────────────────────────────────────────────────────

  const submitRequest = useCallback(
    async ({ itemName, quantity, notes }: { itemName: string; quantity: number; notes: string }) => {
      if (!profile?.org_id || !session?.user.id) throw new Error('Not authenticated');

      const now = new Date().toISOString();
      const newReq: EquipmentRequest = {
        id: generateId(),
        org_id: profile.org_id,
        requested_by: session.user.id,
        requester_name: profile.full_name ?? session.user.email ?? 'Unknown',
        item_name: itemName.trim(),
        quantity: Math.max(1, quantity),
        notes: notes.trim() || null,
        status: 'pending',
        reviewed_by: null,
        reviewed_at: null,
        created_at: now,
      };

      upsertRequest(newReq);

      if (isOnline) {
        const { data, error: sbError } = await supabase
          .from(TABLE)
          .insert(newReq)
          .select()
          .single();

        if (sbError) throw sbError;
        upsertRequest(data as EquipmentRequest);
      } else {
        enqueueOp({ table_name: TABLE, operation: 'insert', payload: JSON.stringify(newReq) });
      }

      bumpLocalVersion();
    },
    [profile, session, isOnline, bumpLocalVersion]
  );

  // ─── Review request (admin only) ─────────────────────────────────────────

  const reviewRequest = useCallback(
    async (requestId: string, newStatus: 'approved' | 'denied') => {
      if (!isAdmin) throw new Error('Not authorized');

      const reviewerName = profile?.full_name ?? session?.user.email ?? 'admin';
      const patch = {
        status: newStatus,
        reviewed_by: reviewerName,
        reviewed_at: new Date().toISOString(),
      };

      // Apply to SQLite immediately
      const existing = requests.find((r) => r.id === requestId);
      if (existing) upsertRequest({ ...existing, ...patch });

      if (isOnline) {
        const { data, error: sbError } = await supabase
          .from(TABLE)
          .update(patch)
          .eq('id', requestId)
          .eq('org_id', profile!.org_id)
          .select()
          .single();

        if (sbError) throw sbError;
        upsertRequest(data as EquipmentRequest);
      } else {
        enqueueOp({ table_name: TABLE, operation: 'update', payload: JSON.stringify({ id: requestId, patch }) });
      }

      bumpLocalVersion();
    },
    [isAdmin, profile, session, requests, isOnline, bumpLocalVersion]
  );

  const refresh = useCallback(async () => {
    await triggerSync();
  }, [triggerSync]);

  return { requests, loading, error, isAdmin, refresh, submitRequest, reviewRequest };
}
