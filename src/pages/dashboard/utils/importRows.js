// src/pages/dashboard/utils/importRows.js
// Turns rows from ImportFileModal into addMultipleItems() input.

/**
 * Keeps every row that has a name and a quantity > 0; counts the rest as
 * skipped. A blank location stays blank here — EquipmentContext stores it as
 * "Unassigned", which is what the modal's "Continue without locations?"
 * dialog tells the user.
 *
 * @returns {{ rows: object[], skipped: number }}
 */
export function buildImportRows(items, actorName) {
  const list = Array.isArray(items) ? items : [];
  const rows = [];
  let skipped = 0;

  for (const item of list) {
    const name = String(item?.name ?? "").trim();
    // Floor first so a fractional value like 0.5 is skipped, not stored as 0
    const quantity = Math.floor(Number(item?.quantity));
    if (!name || !Number.isFinite(quantity) || quantity <= 0) {
      skipped += 1;
      continue;
    }
    rows.push({
      itemId: item.id || "",
      name,
      category: item.category || "",
      source: item.source || "",
      location: String(item.location ?? "").trim(),
      status: item.status || "Available",
      rentalStart: item.startDate || "",
      rentalEnd: item.endDate || "",
      quantity,
      reserveMin: Math.max(0, Math.floor(Number(item.reserveMin) || 0)),
      updatedBy: actorName,
    });
  }

  return { rows, skipped };
}
