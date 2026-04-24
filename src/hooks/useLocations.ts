import { useState, useEffect, useCallback } from 'react';
import { Location } from '../lib/types';
import { getLocationsByOrg } from '../lib/db';
import { useAuthContext } from '../context/AuthContext';
import { useSyncContext } from '../context/SyncContext';

interface UseLocationsReturn {
  locations: Location[];
  locationNames: string[]; // active location names sorted A-Z, for pickers
  loading: boolean;
}

export function useLocations(): UseLocationsReturn {
  const { profile } = useAuthContext();
  const { localVersion } = useSyncContext();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFromDB = useCallback(() => {
    if (!profile?.org_id) return;
    try {
      const locs = getLocationsByOrg(profile.org_id);
      setLocations(locs);
    } catch (e) {
      console.error('[useLocations] SQLite read failed', e);
    } finally {
      setLoading(false);
    }
  }, [profile?.org_id]);

  useEffect(() => {
    loadFromDB();
  }, [loadFromDB, localVersion]);

  const locationNames = locations.map((l) => l.name);

  return { locations, locationNames, loading };
}
