import { useState, useEffect, useCallback, useMemo } from 'react';
import { EquipmentItem } from '../lib/types';
import { getEquipmentByTeam } from '../lib/db';
import { useAuthContext } from '../context/AuthContext';
import { useTeamContext } from '../context/TeamContext';
import { useSyncContext } from '../context/SyncContext';

interface UseInventoryReturn {
  equipment: EquipmentItem[];
  filteredEquipment: EquipmentItem[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  refresh: () => Promise<void>;
}

export function useInventory(): UseInventoryReturn {
  const { profile } = useAuthContext();
  const { activeTeamId } = useTeamContext();
  const { localVersion, triggerSync, isSyncing } = useSyncContext();

  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Read from SQLite — fast and works offline
  const loadFromDB = useCallback(() => {
    if (!profile?.org_id || !activeTeamId) {
      setEquipment([]);
      setLoading(false);
      return;
    }
    try {
      const items = getEquipmentByTeam(profile.org_id, activeTeamId);
      setEquipment(items);
      setError(null);
    } catch (e: any) {
      console.error('[useInventory] SQLite read failed', e);
      setError(e?.message ?? 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [profile?.org_id, activeTeamId]);

  // Re-read whenever the local DB changes (mutation or sync completed)
  useEffect(() => {
    loadFromDB();
  }, [loadFromDB, localVersion]);

  // Show loading state while initial sync is in progress and DB is empty
  useEffect(() => {
    if (isSyncing && equipment.length === 0) {
      setLoading(true);
    }
  }, [isSyncing, equipment.length]);

  // Client-side search: name, category, location
  const filteredEquipment = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return equipment;
    return equipment.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.category ?? '').toLowerCase().includes(q) ||
        (item.location ?? '').toLowerCase().includes(q)
    );
  }, [equipment, searchQuery]);

  // Manual refresh triggers a full Supabase sync
  const refresh = useCallback(async () => {
    await triggerSync();
  }, [triggerSync]);

  return {
    equipment,
    filteredEquipment,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    refresh,
  };
}
