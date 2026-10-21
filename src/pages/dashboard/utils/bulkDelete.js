// src/pages/dashboard/utils/bulkDelete.js
// Turns the result of EquipmentContext.deleteEquipmentMany into what the
// dashboard does next: which ids stay selected and what toast to show.
export function bulkDeleteOutcome(targetIds, result) {
  const removedIds = (result?.removedIds ?? []).map(String);
  const notDeletedIds = (result?.notDeletedIds ?? []).map(String);
  const removed = new Set(removedIds);
  const allDone = notDeletedIds.length === 0;

  return {
    // Updater for setSelectedIds: keep only ids that still exist so a retry
    // targets exactly the rows that were not deleted.
    pruneSelection: (selected) =>
      allDone ? [] : (selected ?? []).filter((id) => !removed.has(String(id))),
    toastType: allDone ? "success" : "error",
    message: allDone
      ? `Deleted ${removedIds.length} item(s)`
      : `Deleted ${removedIds.length} of ${targetIds.length} item(s). ` +
        `${notDeletedIds.length} not deleted: ` +
        `${result?.error?.message || "you may not have permission to delete them"}.`,
  };
}
