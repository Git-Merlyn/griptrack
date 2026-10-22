// src/pages/dashboard/utils/itemValidation.js
// Validation for the dashboard Add/Edit item form.

const toNumber = (v) => (v === "" || v === null || v === undefined ? 0 : Number(v));

/**
 * Check the Add/Edit form values before saving.
 *
 * Returns { ok: true, quantity, reserveMin } with the numbers to save, or
 * { ok: false, error } with a message to show the user.
 * Quantity 0 is allowed only when a reserve minimum is set: the item is then
 * tracked as "below reserve".
 */
export function validateItemForm(item) {
  const name = String(item?.name ?? "").trim();
  const location = String(item?.location ?? "").trim();
  const quantity = toNumber(item?.quantity);
  const reserveMin = toNumber(item?.reserveMin);

  if (!name) return { ok: false, error: "Name is required." };
  if (!location) return { ok: false, error: "Choose a location." };
  if (!Number.isInteger(quantity) || !Number.isInteger(reserveMin)) {
    return { ok: false, error: "Quantity and reserve minimum must be whole numbers." };
  }
  if (quantity < 0 || reserveMin < 0) {
    return { ok: false, error: "Quantity and reserve minimum can't be negative." };
  }
  if (quantity === 0 && reserveMin === 0) {
    return {
      ok: false,
      error: "Quantity must be at least 1 (or set a reserve minimum to track an item at 0).",
    };
  }
  const start = item?.rentalStart || "";
  const end = item?.rentalEnd || "";
  if (start && end && start > end) {
    return { ok: false, error: "Start date must be on or before the end date." };
  }
  return { ok: true, quantity, reserveMin };
}
