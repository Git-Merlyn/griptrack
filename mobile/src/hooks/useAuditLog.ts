import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../context/AuthContext';

const AUDIT_TABLE = 'equipment_audit';

export interface AuditEvent {
  id: string;
  org_id: string;
  equipment_id: string;
  action: string;           // create | edit | delete | move | merge | damage
  actor: string | null;     // display name / email (written by both platforms)
  user_id: string | null;   // UUID (written by mobile, being added to web)
  from_location: string | null;
  to_location: string | null;
  delta_qty: number | null;
  meta: Record<string, unknown> | null;
  at: string;
}

interface UseAuditLogReturn {
  logs: AuditEvent[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useAuditLog(equipmentId: string): UseAuditLogReturn {
  const { profile } = useAuthContext();

  const [logs, setLogs] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!equipmentId || !profile?.org_id) {
      setLogs([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: sbError } = await supabase
        .from(AUDIT_TABLE)
        .select('*')
        .eq('equipment_id', equipmentId)
        .eq('org_id', profile.org_id)
        .order('at', { ascending: false })
        .limit(100);

      if (sbError) throw sbError;
      setLogs((data ?? []) as AuditEvent[]);
    } catch (e: any) {
      console.error('[useAuditLog] fetch failed', e);
      setError(e?.message ?? 'Failed to load history');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [equipmentId, profile?.org_id]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return { logs, loading, error, refresh: fetchLogs };
}
