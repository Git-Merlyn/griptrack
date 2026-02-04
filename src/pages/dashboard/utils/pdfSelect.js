// src/pages/dashboard/utils/pdfSelect.js
import { normalizeName } from "./helpers";

/**
 * Match parsed file items (from ImportFileModal) against DB equipment rows.
 *
 * Matching priority:
 * 1) itemId exact match (line.id -> row.itemId)
 * 2) normalized name match (line.name -> row.name)
 *
 * Returns:
 * - ids: array of equipment row UUIDs to select
 * - ambiguous: count of input lines whose name matched multiple DB rows
 * - notFound: count of input lines with no match
 */
export function matchFileItemsToEquipment({ items, equipment }) {
  const rows = Array.isArray(equipment) ? equipment : [];
  const parsed = Array.isArray(items) ? items : [];

  // itemId -> array of DB row ids (in case itemId isn't unique)
  const byItemId = new Map();
  // normalized name -> array of DB row ids
  const byName = new Map();

  for (const row of rows) {
    const rid = String(row?.id || "").trim();
    if (!rid) continue;

    const iid = String(row?.itemId || "").trim();
    if (iid) {
      if (!byItemId.has(iid)) byItemId.set(iid, []);
      byItemId.get(iid).push(rid);
    }

    const nk = normalizeName(row?.name);
    if (nk) {
      if (!byName.has(nk)) byName.set(nk, []);
      byName.get(nk).push(rid);
    }
  }

  const selected = new Set();
  let notFound = 0;
  let ambiguous = 0;

  for (const line of parsed) {
    // ImportFileModal parsed shape:
    // line.id -> internal itemId (optional)
    // line.name -> display name
    const lineItemId = String(line?.id || "").trim();
    const lineNameKey = normalizeName(line?.name);

    // Ignore empty/blank lines from the parser
    if (!lineItemId && !lineNameKey) continue;

    if (lineItemId && byItemId.has(lineItemId)) {
      const matches = byItemId.get(lineItemId);
      // If multiple rows share itemId, select all (safer than guessing)
      if (matches.length > 1) ambiguous += 1;
      matches.forEach((id) => selected.add(id));
      continue;
    }

    if (lineNameKey && byName.has(lineNameKey)) {
      const matches = byName.get(lineNameKey);
      if (matches.length > 1) ambiguous += 1;
      matches.forEach((id) => selected.add(id));
      continue;
    }

    notFound += 1;
  }

  return {
    ids: Array.from(selected),
    ambiguous,
    notFound,
  };
}
