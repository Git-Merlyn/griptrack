import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Location } from '../lib/types';
import { useAuthContext } from '../context/AuthContext';

interface UseLocationsReturn {
  locations: Location[];
  locationNames: string[]; // active location names sorted A-Z, for pickers
  loading: boolean;
}

export function useLocations(): UseLocationsReturn {
  const { profile } = useAuthContext();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLocations = useCallback(async () => {
    if (!profile?.org_id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('locations')
        .select('id, org_id, name, is_active')
        .eq('org_id', profile.org_id)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;
      setLocations((data ?? []) as Location[]);
    } catch (err) {
      console.error('Failed to load locations', err);
    } finally {
      setLoading(false);
    }
  }, [profile?.org_id]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const locationNames = locations.map((l) => l.name);

  return { locations, locationNames, loading };
}
