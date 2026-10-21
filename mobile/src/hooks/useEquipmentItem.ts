import { useMemo } from 'react';
import { EquipmentItem } from '../lib/types';
import { getEquipmentById } from '../lib/db';
import { useSyncContext } from '../context/SyncContext';

/**
 * Live view of one cached equipment row. Re-reads SQLite whenever local data
 * changes (own edits, sync pulls, realtime events — all bump localVersion).
 * Returns `fallback` (e.g. the route-param snapshot) when the row isn't
 * cached, such as after it was deleted elsewhere while the screen is open.
 */
export function useEquipmentItem(id: string, fallback: EquipmentItem): EquipmentItem {
  const { localVersion } = useSyncContext();
  return useMemo(() => {
    try {
      return getEquipmentById(id) ?? fallback;
    } catch (e) {
      console.warn('[useEquipmentItem] SQLite read failed', e);
      return fallback;
    }
    // localVersion is the "SQLite changed" signal; it is intentionally a dep.
  }, [id, fallback, localVersion]);
}
