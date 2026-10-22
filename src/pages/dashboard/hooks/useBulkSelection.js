import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Bulk selection state + helpers for Dashboard
 *
 * Inputs:
 * - visibleRows: array of rows currently visible (sorted/filtered) so "Select all visible" works
 * - onExitBulkMode: optional callback when bulkMode turns off (e.g., close details modal)
 */
export default function useBulkSelection({
  visibleRows = [],
  onExitBulkMode,
} = {}) {
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkLocation, setBulkLocation] = useState("");

  const onExitBulkModeRef = useRef(onExitBulkMode);
  useEffect(() => {
    onExitBulkModeRef.current = onExitBulkMode;
  }, [onExitBulkMode]);

  const visibleIds = useMemo(() => {
    return (Array.isArray(visibleRows) ? visibleRows : [])
      .map((r) => String(r?.id || ""))
      .filter(Boolean);
  }, [visibleRows]);

  const isSelected = useCallback(
    (id) => selectedIds.includes(String(id)),
    [selectedIds],
  );

  const toggleSelected = useCallback((id) => {
    const sid = String(id);
    setSelectedIds((prev) =>
      prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid],
    );
  }, []);

  // Adds the visible rows to the selection. Rows selected on other pages or
  // via "Select from File" stay selected.
  const selectAllVisible = useCallback(() => {
    setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
  }, [visibleIds]);

  // Removes only the visible rows from the selection.
  const deselectVisible = useCallback(() => {
    const visible = new Set(visibleIds);
    setSelectedIds((prev) => prev.filter((id) => !visible.has(id)));
  }, [visibleIds]);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  // When bulk mode turns off, reset selection and location and run exit callback.
  // NOTE: `onExitBulkMode` is often passed as an inline function from the parent,
  // so we store it in a ref to avoid triggering this effect every render.
  // didMountRef prevents the callback from firing spuriously on initial mount.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (!bulkMode) {
      setSelectedIds((prev) => (prev.length ? [] : prev));
      setBulkLocation((prev) => (prev ? "" : prev));

      const cb = onExitBulkModeRef.current;
      if (typeof cb === "function") cb();
    }
  }, [bulkMode]);

  return {
    bulkMode,
    setBulkMode,

    selectedIds,
    setSelectedIds,

    bulkLocation,
    setBulkLocation,

    isSelected,
    toggleSelected,
    selectAllVisible,
    deselectVisible,
    clearSelection,
  };
}
