// src/pages/dashboard/hooks/useFilterPresets.js
// Manages named filter presets stored in localStorage per org.
// A preset captures the current state of all active filters so users can
// re-apply common combinations (e.g. "Ladders only", "Last week") in one click.

import { useState, useCallback } from "react";

const STORAGE_KEY_PREFIX = "gt_filter_presets_";

function loadPresets(orgId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + (orgId || "default"));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePresets(orgId, presets) {
  try {
    localStorage.setItem(
      STORAGE_KEY_PREFIX + (orgId || "default"),
      JSON.stringify(presets),
    );
  } catch {
    // ignore write failures (private mode, quota exceeded, etc.)
  }
}

/**
 * @param {{ orgId: string }} options
 * @returns {{
 *   presets: Array<{ id: string, name: string, filters: object }>,
 *   savePreset: (name: string, filters: object) => void,
 *   deletePreset: (id: string) => void,
 * }}
 */
const useFilterPresets = ({ orgId } = {}) => {
  const [presets, setPresets] = useState(() => loadPresets(orgId));

  const savePreset = useCallback(
    (name, filters) => {
      const trimmed = String(name || "").trim();
      if (!trimmed) return;

      const next = [
        ...presets,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: trimmed,
          filters,
        },
      ];

      setPresets(next);
      savePresets(orgId, next);
    },
    [presets, orgId],
  );

  const deletePreset = useCallback(
    (id) => {
      const next = presets.filter((p) => p.id !== id);
      setPresets(next);
      savePresets(orgId, next);
    },
    [presets, orgId],
  );

  return { presets, savePreset, deletePreset };
};

export default useFilterPresets;
