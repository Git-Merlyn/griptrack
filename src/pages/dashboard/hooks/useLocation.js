import { useMemo } from "react";

/**
 * useLocation
 * Produces the merged `allLocations` list for the dashboard dropdowns: the
 * org's active locations (Locations table, from context) plus any location
 * name still used by an item.
 *
 * There is no device-local list (WP15 Decision 3 = B). A new location is
 * saved to the shared `locations` table by an owner, admin or department head
 * (EquipmentContext.registerLocation); crew pick existing locations only.
 * Lists that older builds left in localStorage (`griptrack_custom_locations`,
 * `customLocations`, `griptrack_locations_custom`) are no longer read.
 *
 * Inputs:
 * - contextLocations: string[] (active names from the Locations table / context)
 * - equipment: equipment row[] (used to infer locations from existing items)
 */
export default function useLocation({ contextLocations = [], equipment = [] } = {}) {
  const inferredEquipmentLocations = useMemo(() => {
    const list = Array.isArray(equipment) ? equipment : [];
    const set = new Set();
    for (const row of list) {
      const loc = row?.location;
      if (typeof loc === "string" && loc.trim()) set.add(loc.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [equipment]);

  const allLocations = useMemo(() => {
    const fromCtx = Array.isArray(contextLocations) ? contextLocations : [];

    // Case-insensitive de-dupe while preserving a display value.
    // Precedence: contextLocations > inferredEquipmentLocations
    const map = new Map();
    const addList = (list) => {
      for (const raw of list) {
        const display = typeof raw === "string" ? raw.trim() : "";
        if (!display) continue;
        const key = display.toLowerCase();
        if (!map.has(key)) map.set(key, display);
      }
    };

    addList(fromCtx);
    addList(inferredEquipmentLocations);

    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [contextLocations, inferredEquipmentLocations]);

  return { allLocations };
}
