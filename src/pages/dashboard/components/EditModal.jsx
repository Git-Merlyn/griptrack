import React from "react";

/**
 * EditModal (Dashboard-scoped)
 * - Desktop-first overlay modal (matches legacy/live styling)
 * - Uses button classes from index.css (btn-secondary / btn-accent / btn-danger)
 * - Does NOT auto-close on Save/Delete; parent controls `isOpen`
 */
export default function EditModal({
  isOpen,
  variant = "desktop", // "desktop" | "mobile" (kept for future parity)
  title = "Edit Item",
  editingId = null,
  newItem,
  allLocations = [],
  statusOptions = [],
  onChangeField,
  onRequestAddLocation,
  onCancel,
  onSave,
  onDelete,
}) {
  if (!isOpen) return null;

  const isMobile = variant === "mobile";

  const stop = (e) => e.stopPropagation();

  const setText = (key) => (e) => onChangeField?.(key, e.target.value);

  // Allow blank while typing, avoid the old "min=1" trap.
  const setQty = (e) => {
    const raw = e.target.value;
    if (raw === "") {
      onChangeField?.("quantity", "");
      return;
    }
    const v = parseInt(raw, 10);
    onChangeField?.("quantity", Number.isFinite(v) ? v : 0);
  };

  const setReserve = (e) => {
    const raw = e.target.value;
    if (raw === "") {
      onChangeField?.("reserveMin", 0);
      return;
    }
    const v = parseInt(raw, 10);
    onChangeField?.("reserveMin", Number.isFinite(v) ? v : 0);
  };

  const onLocationChange = (e) => {
    const v = e.target.value;
    if (v === "__add_new__") {
      onRequestAddLocation?.();
      return;
    }
    onChangeField?.("location", v);
  };

  const canDelete = typeof onDelete === "function";

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/60 z-50"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={
          "bg-surface rounded-xl w-[94%] max-w-xl shadow-lg " +
          "max-h-[calc(100dvh-24px)] overflow-hidden flex flex-col"
        }
        onClick={stop}
      >
        <div className="px-6 pt-6 pb-4">
          <h3 className="text-xl font-bold text-accent">{title}</h3>
          {newItem?.name ? (
            <div className="text-sm text-gray-300 mt-1 truncate">
              {newItem.name}
            </div>
          ) : null}
        </div>

        <div className="px-6 pb-6 overflow-y-auto flex-1">
          <div className="flex flex-col gap-3">
            <label className="text-sm text-gray-300">Name</label>
            <input
              type="text"
              value={newItem?.name ?? ""}
              onChange={setText("name")}
              className="w-full px-3 py-2 rounded bg-white text-black"
            />

            <label className="text-sm text-gray-300">Category</label>
            <input
              type="text"
              value={newItem?.category ?? ""}
              onChange={setText("category")}
              className="w-full px-3 py-2 rounded bg-white text-black"
            />

            <label className="text-sm text-gray-300">Source</label>
            <input
              type="text"
              value={newItem?.source ?? ""}
              onChange={setText("source")}
              className="w-full px-3 py-2 rounded bg-white text-black"
            />

            <label className="text-sm text-gray-300">Location</label>
            <select
              value={newItem?.location ?? ""}
              onChange={onLocationChange}
              className="w-full px-3 py-2 rounded bg-white text-black"
            >
              <option value="">Select location</option>
              {allLocations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
              <option value="__add_new__">➕ Add new location...</option>
            </select>

            <label className="text-sm text-gray-300">Status</label>
            <select
              value={newItem?.status ?? "Available"}
              onChange={setText("status")}
              className="w-full px-3 py-2 rounded bg-white text-black"
            >
              {(statusOptions?.length
                ? statusOptions
                : ["Available", "Out", "Damaged"]
              ).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <label className="text-sm text-gray-300">Quantity</label>
                <input
                  type="number"
                  min="0"
                  value={
                    newItem?.quantity === "" || newItem?.quantity === null
                      ? ""
                      : (newItem?.quantity ?? "")
                  }
                  onChange={setQty}
                  className="w-full px-3 py-2 rounded bg-white text-black"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm text-gray-300">Reserve minimum</label>
                <input
                  type="number"
                  min="0"
                  value={newItem?.reserveMin ?? 0}
                  onChange={setReserve}
                  className="w-full px-3 py-2 rounded bg-white text-black"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <label className="text-sm text-gray-300">Start date</label>
                <input
                  type="date"
                  value={newItem?.rentalStart || ""}
                  onChange={setText("rentalStart")}
                  className="w-full px-3 py-2 rounded bg-white text-black"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm text-gray-300">End date</label>
                <input
                  type="date"
                  value={newItem?.rentalEnd || ""}
                  onChange={setText("rentalEnd")}
                  className="w-full px-3 py-2 rounded bg-white text-black"
                />
              </div>
            </div>

            {/* variant is currently only used for future sizing tweaks */}
            {isMobile ? null : null}
          </div>
        </div>

        <div className="px-6 pt-4 pb-6 border-t border-white/10 bg-surface">
          <div className="flex justify-end gap-2 flex-wrap">
            <button type="button" onClick={onCancel} className="btn-secondary">
              Cancel
            </button>

            <button
              type="button"
              onClick={() => onSave?.()}
              className="btn-accent"
            >
              Save
            </button>

            {canDelete ? (
              <button
                type="button"
                onClick={() => onDelete?.(editingId, newItem?.name)}
                className="btn-danger"
              >
                Delete
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
