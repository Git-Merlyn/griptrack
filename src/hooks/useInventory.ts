import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { EquipmentItem } from '../lib/types';
import { useAuthContext } from '../context/AuthContext';
import { useTeamContext } from '../context/TeamContext';

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

  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchEquipment = useCallback(async () => {
    if (!profile?.org_id || !activeTeamId) return;
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('equipment_items')
        .select('*')
        .eq('org_id', profile.org_id)
        .eq('team_id', activeTeamId)   // scoped to active team (always set)
        .order('name', { ascending: true });

      if (error) throw error;

      // Filter out any placeholder rows
      const rows = (data ?? []).filter(
        (item) => item.name && item.name !== '__placeholder__'
      ) as EquipmentItem[];

      setEquipment(rows);
    } catch (err: any) {
      console.error('Failed to load equipment', err);
      setError(err?.message ?? 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [profile?.org_id, activeTeamId]);

  useEffect(() => {
    fetchEquipment();
  }, [fetchEquipment]);

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

  return {
    equipment,
    filteredEquipment,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    refresh: fetchEquipment,
  };
}
