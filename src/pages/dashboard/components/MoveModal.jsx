import React, { useId } from "react";
import useDialog from "@/hooks/useDialog";

const MoveModal = ({
  isOpen,
  movingItem,
  moveData,
  setMoveData,
  allLocations,
  onRequestAddLocation,
  onCancel,
  onConfirm,
}) => {
  const fieldId = useId();
  const open = !!isOpen && !!movingItem;
  const { panelRef, titleId } = useDialog({ isOpen: open, onClose: onCancel });

  if (!open) return null;

  const max = Number(movingItem.quantity) || 0;
  const qtyNum = Number(moveData.qty);
  const qtyOk = Number.isInteger(qtyNum) && qtyNum >= 1 && qtyNum <= max;
  const sameLocation =
    !!moveData.newLocation &&
    String(moveData.newLocation).trim().toLowerCase() ===
      String(movingItem.location ?? "").trim().toLowerCase();
  const hint =
    max === 0
      ? "Nothing to move: this item's quantity is 0."
      : !qtyOk
        ? `Enter a quantity from 1 to ${max}.`
        : !moveData.newLocation
          ? "Choose a destination."
          : sameLocation
            ? "The item is already at this location."
            : "";
  const canConfirm = hint === "";

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
        className="bg-surface p-6 rounded-xl w-[90%] max-w-md shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="text-xl font-bold text-accent mb-4">
          Move {movingItem.name}
        </h3>

        <div className="flex flex-col gap-3">
          <label htmlFor={`${fieldId}-qty`} className="text-sm text-gray-300">
            Quantity to move (max {movingItem.quantity}):
          </label>
          <input
            id={`${fieldId}-qty`}
            type="number"
            min="0"
            max={movingItem.quantity}
            value={moveData.qty}
            onChange={(e) => {
              const raw = e.target.value;

              // Allow clearing while typing
              if (raw === "") {
                setMoveData({ ...moveData, qty: "" });
                return;
              }

              const n = Number(raw);
              if (!Number.isNaN(n)) {
                setMoveData({ ...moveData, qty: n });
              }
            }}
            onBlur={() => {
              // Enforce min/max when leaving the field (move qty must be at least 1)
              const max = Number(movingItem.quantity) || 0;
              const n = Number(moveData.qty);
              const clamped = Math.min(
                max,
                Math.max(1, Number.isFinite(n) ? n : 1),
              );
              setMoveData({ ...moveData, qty: clamped });
            }}
            className="px-3 py-2 rounded bg-white text-black"
          />

          <label htmlFor={`${fieldId}-location`} className="text-sm text-gray-300">
            New location:
          </label>
          <select
            id={`${fieldId}-location`}
            value={moveData.newLocation}
            onChange={(e) => {
              if (e.target.value === "__add_new__") onRequestAddLocation();
              else setMoveData({ ...moveData, newLocation: e.target.value });
            }}
            className="px-3 py-2 rounded bg-white text-black"
          >
            <option value="">Select location</option>
            {allLocations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
            <option value="__add_new__">➕ Add new location...</option>
          </select>

          {hint && (
            <p className="text-sm text-warning" role="status">
              {hint}
            </p>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={onCancel} className="btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!canConfirm}
              className={canConfirm ? "btn-accent" : "btn-disabled"}
            >
              Confirm Move
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MoveModal;
