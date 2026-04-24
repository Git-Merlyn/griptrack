import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { EquipmentItem } from '../lib/types';
import { useAuthContext } from '../context/AuthContext';
import { useProductionContext } from '../context/ProductionContext';

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
  const { activeProductionId } = useProductionContext();

  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchEquipment = useCallback(async () => {
    if (!profile?.org_id) return;
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('equipment_items')
        .select('*')
        .eq('org_id', profile.org_id)
        .order('name', { ascending: true });

      // Scope to active production, or general pool (null)
      if (activeProductionId) {
        query = query.eq('production_id', activeProductionId);
      } else {
        query = query.is('production_id', null);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Filter out placeholder rows used by the web app
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
  }, [profile?.org_id, activeProductionId]);

  useEffect(() => {
    fetchEquipment();
  }, [fetchEquipment]);

  // Client-side search filter (name, category, location)
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
