import { useCallback, useMemo, useState } from 'react';

export interface BulkSelectionResult {
  bulkMode: boolean;
  selectedIds: string[];
  enterBulkMode: (initialId?: string) => void;
  exitBulkMode: () => void;
  isSelected: (id: string) => boolean;
  toggleSelected: (id: string) => void;
  selectAllVisible: (ids: string[]) => void;
  clearSelection: () => void;
}

export function useBulkSelection(): BulkSelectionResult {
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const enterBulkMode = useCallback((initialId?: string) => {
    setBulkMode(true);
    setSelectedIds(initialId ? [initialId] : []);
  }, []);

  const exitBulkMode = useCallback(() => {
    setBulkMode(false);
    setSelectedIds([]);
  }, []);

  const isSelected = useCallback((id: string) => selectedSet.has(id), [selectedSet]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }, []);

  const selectAllVisible = useCallback((ids: string[]) => {
    setSelectedIds(ids);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  return {
    bulkMode,
    selectedIds,
    enterBulkMode,
    exitBulkMode,
    isSelected,
    toggleSelected,
    selectAllVisible,
    clearSelection,
  };
}
