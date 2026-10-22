import React, { useId } from "react";
import useDialog from "@/hooks/useDialog";

/**
 * EditModal (Dashboard-scoped) — the Add Item / Edit Item form.
 * - Uses button classes from index.css (btn-secondary / btn-accent / btn-danger)
 * - Does NOT auto-close on Save/Delete; parent controls `isOpen`
 * - Escape, an overlay click and Cancel all call onCancel
 * - The Delete button renders only when `onDelete` is a function (the parent
 *   passes it only while editing an existing item)
 * - `saving` disables Save while the parent's save request is in flight
 */
export default function EditModal({
  isOpen,
  title = "Edit Item",
  editingId = null,
  newItem,
  allLocations = [],
  statusOptions = [],
  saving = false,
  onChangeField,
  onRequestAddLocation,
  onCancel,
  onSave,
  onDelete,
}) {
  const fieldId = useId();
  const { panelRef, titleId } = useDialog({ isOpen, onClose: onCancel });

  if (!isOpen) return null;

  const idFor = (key) => `${fieldId}-${key}`;

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
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={
          "bg-surface rounded-xl w-[94%] max-w-xl shadow-lg " +
          "max-h-[calc(100dvh-24px)] overflow-hidden flex flex-col"
        }
        onClick={stop}
      >
        <div className="px-6 pt-6 pb-4">
          <h3 id={titleId} className="text-xl font-bold text-accent">
            {title}
          </h3>
          {newItem?.name ? (
            <div className="text-sm text-gray-300 mt-1 truncate">
              {newItem.name}
            </div>
          ) : null}
        </div>

        <div className="px-6 pb-6 overflow-y-auto flex-1">
          <div className="flex flex-col gap-3">
            <label htmlFor={idFor("name")} className="text-sm text-gray-300">
              Name
            </label>
            <input
              id={idFor("name")}
              type="text"
              value={newItem?.name ?? ""}
              onChange={setText("name")}
              className="w-full px-3 py-2 rounded bg-white text-black"
            />

            <label htmlFor={idFor("category")} className="text-sm text-gray-300">
              Category
            </label>
            <input
              id={idFor("category")}
              type="text"
              value={newItem?.category ?? ""}
              onChange={setText("category")}
              className="w-full px-3 py-2 rounded bg-white text-black"
            />

            <label htmlFor={idFor("source")} className="text-sm text-gray-300">
              Source
            </label>
            <input
              id={idFor("source")}
              type="text"
              value={newItem?.source ?? ""}
              onChange={setText("source")}
              className="w-full px-3 py-2 rounded bg-white text-black"
            />

            <label htmlFor={idFor("location")} className="text-sm text-gray-300">
              Location
            </label>
            <select
              id={idFor("location")}
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

            <label htmlFor={idFor("status")} className="text-sm text-gray-300">
              Status
            </label>
            <select
              id={idFor("status")}
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
                <label htmlFor={idFor("quantity")} className="text-sm text-gray-300">
                  Quantity
                </label>
                <input
                  id={idFor("quantity")}
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
                <label htmlFor={idFor("reserve")} className="text-sm text-gray-300">
                  Reserve minimum
                </label>
                <input
                  id={idFor("reserve")}
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
                <label htmlFor={idFor("start")} className="text-sm text-gray-300">
                  Start date
                </label>
                <input
                  id={idFor("start")}
                  type="date"
                  value={newItem?.rentalStart || ""}
                  onChange={setText("rentalStart")}
                  className="w-full px-3 py-2 rounded bg-white text-black"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor={idFor("end")} className="text-sm text-gray-300">
                  End date
                </label>
                <input
                  id={idFor("end")}
                  type="date"
                  value={newItem?.rentalEnd || ""}
                  onChange={setText("rentalEnd")}
                  className="w-full px-3 py-2 rounded bg-white text-black"
                />
              </div>
            </div>
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
              disabled={saving}
              className={saving ? "btn-disabled" : "btn-accent"}
            >
              {saving ? "Saving…" : "Save"}
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
