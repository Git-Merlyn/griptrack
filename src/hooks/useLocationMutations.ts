import { supabase } from '../lib/supabase';
import { useAuthContext } from '../context/AuthContext';
import { useSyncContext } from '../context/SyncContext';
import { generateId, upsertLocation, deleteLocationLocal } from '../lib/db';

const LOCATIONS_TABLE = 'locations';

export function useLocationMutations() {
  const { profile } = useAuthContext();
  const { bumpLocalVersion } = useSyncContext();

  async function addLocation(name: string): Promise<void> {
    if (!profile?.org_id) throw new Error('Not authenticated');

    const newLoc = {
      id: generateId(),
      org_id: profile.org_id,
      name: name.trim(),
      is_active: true,
    };

    upsertLocation(newLoc);

    const { error } = await supabase.from(LOCATIONS_TABLE).insert(newLoc);
    if (error) throw new Error(error.message);

    bumpLocalVersion();
  }

  async function renameLocation(id: string, name: string): Promise<void> {
    const { error } = await supabase
      .from(LOCATIONS_TABLE)
      .update({ name: name.trim() })
      .eq('id', id);

    if (error) throw new Error(error.message);

    bumpLocalVersion();
  }

  async function toggleLocation(id: string, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from(LOCATIONS_TABLE)
      .update({ is_active: isActive })
      .eq('id', id);

    if (error) throw new Error(error.message);

    bumpLocalVersion();
  }

  async function deleteLocation(id: string): Promise<void> {
    deleteLocationLocal(id);

    const { error } = await supabase.from(LOCATIONS_TABLE).delete().eq('id', id);
    if (error) throw new Error(error.message);

    bumpLocalVersion();
  }

  return { addLocation, renameLocation, toggleLocation, deleteLocation };
}
