import { supabase } from '../lib/supabase';
import { useAuthContext } from '../context/AuthContext';
import { useSyncContext } from '../context/SyncContext';
import {
  generateId,
  upsertLocation,
  renameLocationLocal,
  setLocationActiveLocal,
  deleteLocationLocal,
  enqueueOp,
} from '../lib/db';

const LOCATIONS_TABLE = 'locations';

/**
 * Location mutations — offline-aware, matching the equipment pattern:
 * when online, write to Supabase first and mirror into SQLite on success;
 * when offline, write SQLite immediately and queue the op for drain.
 * drainQueue's generic insert/update/delete handling replays these.
 */
export function useLocationMutations() {
  const { profile } = useAuthContext();
  const { isOnline, bumpLocalVersion } = useSyncContext();

  async function addLocation(name: string): Promise<void> {
    if (!profile?.org_id) throw new Error('Not authenticated');

    const newLoc = {
      id: generateId(),
      org_id: profile.org_id,
      name: name.trim(),
      is_active: true,
    };

    if (isOnline) {
      const { error } = await supabase.from(LOCATIONS_TABLE).insert(newLoc);
      if (error) throw new Error(error.message);
      upsertLocation(newLoc);
    } else {
      upsertLocation(newLoc);
      enqueue('insert', newLoc);
    }

    bumpLocalVersion();
  }

  async function renameLocation(id: string, name: string): Promise<void> {
    const trimmed = name.trim();

    if (isOnline) {
      const { error } = await supabase
        .from(LOCATIONS_TABLE)
        .update({ name: trimmed })
        .eq('id', id);
      if (error) throw new Error(error.message);
      renameLocationLocal(id, trimmed);
    } else {
      renameLocationLocal(id, trimmed);
      enqueue('update', { id, patch: { name: trimmed } });
    }

    bumpLocalVersion();
  }

  async function toggleLocation(id: string, isActive: boolean): Promise<void> {
    if (isOnline) {
      const { error } = await supabase
        .from(LOCATIONS_TABLE)
        .update({ is_active: isActive })
        .eq('id', id);
      if (error) throw new Error(error.message);
      setLocationActiveLocal(id, isActive);
    } else {
      setLocationActiveLocal(id, isActive);
      enqueue('update', { id, patch: { is_active: isActive } });
    }

    bumpLocalVersion();
  }

  async function deleteLocation(id: string): Promise<void> {
    if (isOnline) {
      const { error } = await supabase.from(LOCATIONS_TABLE).delete().eq('id', id);
      if (error) throw new Error(error.message);
      deleteLocationLocal(id);
    } else {
      deleteLocationLocal(id);
      enqueue('delete', { id });
    }

    bumpLocalVersion();
  }

  return { addLocation, renameLocation, toggleLocation, deleteLocation };
}

function enqueue(operation: 'insert' | 'update' | 'delete', payload: object): void {
  enqueueOp({ table_name: LOCATIONS_TABLE, operation, payload: JSON.stringify(payload) });
}
