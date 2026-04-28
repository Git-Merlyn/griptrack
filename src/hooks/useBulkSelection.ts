import { useState } from 'react';

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

  function enterBulkMode(initialId?: string) {
    setBulkMode(true);
    setSelectedIds(initialId ? [initialId] : []);
  }

  function exitBulkMode() {
    setBulkMode(false);
    setSelectedIds([]);
  }

  function isSelected(id: string) {
    return selectedIds.includes(id);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }

  function selectAllVisible(ids: string[]) {
    setSelectedIds(ids);
  }

  function clearSelection() {
    setSelectedIds([]);
  }

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
