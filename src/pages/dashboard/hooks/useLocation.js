import { useEffect, useMemo, useState } from "react";

/**
 * useLocation
 * Manages custom locations (stored locally) and produces a merged `allLocations` list.
 *
 * Inputs:
 * - contextLocations: string[] (from Locations table / context)
 * - equipment: equipment row[] (used to infer locations from existing items)
 * - storageKey?: string (localStorage key)
 */
export default function useLocation({
  contextLocations = [],
  equipment = [],
  storageKey = "griptrack_custom_locations",
} = {}) {
  const [customLocations, setCustomLocations] = useState([]);

  // Load once
  useEffect(() => {
    const tryParse = (raw) => {
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    };

    // Primary key
    const primary = tryParse(localStorage.getItem(storageKey));
    if (primary) {
      setCustomLocations(primary);
      return;
    }

    // Fallback keys (older builds)
    const fallback =
      tryParse(localStorage.getItem("customLocations")) ||
      tryParse(localStorage.getItem("griptrack_locations_custom"));

    if (fallback) setCustomLocations(fallback);
  }, [storageKey]);

  // Persist
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(customLocations));
    } catch {
      // ignore storage errors
    }
  }, [customLocations, storageKey]);

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
    const fromCustom = Array.isArray(customLocations) ? customLocations : [];

    // Case-insensitive de-dupe while preserving a display value.
    // Precedence: contextLocations > inferredEquipmentLocations > customLocations
    const toKey = (x) =>
      String(x || "")
        .trim()
        .toLowerCase();
    const map = new Map();

    const addList = (list) => {
      for (const raw of list) {
        const display = typeof raw === "string" ? raw.trim() : "";
        if (!display) continue;
        const key = toKey(display);
        if (!map.has(key)) map.set(key, display);
      }
    };

    addList(fromCtx);
    addList(inferredEquipmentLocations);
    addList(fromCustom);

    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [contextLocations, inferredEquipmentLocations, customLocations]);

  const addCustomLocation = (name) => {
    const trimmed = String(name || "").trim();
    if (!trimmed) return;

    const key = trimmed.toLowerCase();
    setCustomLocations((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const map = new Map();
      for (const raw of list) {
        const display = String(raw || "").trim();
        if (!display) continue;
        const k = display.toLowerCase();
        if (!map.has(k)) map.set(k, display);
      }

      // Only add if it's not already present (case-insensitive)
      if (!map.has(key)) map.set(key, trimmed);

      return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
    });
  };

  return {
    allLocations,
    customLocations,
    setCustomLocations,
    addCustomLocation,
  };
}
