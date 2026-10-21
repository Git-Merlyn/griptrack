// src/pages/dashboard/utils/bulkMove.js

/**
 * Bulk "Apply location": move each selected row WHOLE to `location` through
 * the context's moveEquipment (the move_equipment RPC), one at a time.
 *
 * - Whole-row moves (qty = null) merge into an identical row at the
 *   destination exactly like a single move, and never rewrite any other field
 *   (a quantity-0 row stays 0).
 * - Sequential on purpose: each move must see the merges made by the
 *   previous one.
 * - Never throws. Rows already at `location` (or no longer loaded) are skipped.
 *
 * Returns { moved, skipped, failed: [{ id, name, message }] }.
 */
export async function bulkMoveToLocation({ ids, equipment, location, actor, moveEquipment }) {
  const result = { moved: 0, skipped: 0, failed: [] };

  for (const id of ids ?? []) {
    const row = (equipment ?? []).find((e) => String(e.id) === String(id));
    if (!row || row.location === location) {
      result.skipped++;
      continue;
    }
    try {
      await moveEquipment(row.id, null, location, actor, { silent: true });
      result.moved++;
    } catch (e) {
      result.failed.push({ id: row.id, name: row.name, message: e?.message || "Move failed" });
    }
  }

  return result;
}
