import { PickerOption, stringOptions } from '../components/PickerModal';

/** Picker key for the "+ New location…" entry; never a real location name. */
export const NEW_LOCATION_KEY = '__new_location__';

/**
 * Options for the Add/Edit Item location picker. People who may create
 * locations (canEditLocations: owner, admin, department head) get a
 * "+ New location…" entry first; crew only ever pick existing ones (D22).
 */
export function locationPickerOptions(names: string[], canAddLocation: boolean): PickerOption[] {
  const existing = stringOptions(names);
  return canAddLocation ? [{ key: NEW_LOCATION_KEY, label: '+ New location…' }, ...existing] : existing;
}

/**
 * Validates a new location name against every location in the org,
 * archived ones included (the server's (org_id, name) key is unique too).
 * Returns an error message, or null when the name can be used.
 */
export function newLocationNameError(name: string, allNames: string[]): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Please enter a location name.';
  const clash = allNames.find((n) => n.trim().toLowerCase() === trimmed.toLowerCase());
  if (clash) return `A location named "${clash}" already exists. Pick it from the list, or reactivate it in Settings › Manage Locations if it is archived.`;
  return null;
}
