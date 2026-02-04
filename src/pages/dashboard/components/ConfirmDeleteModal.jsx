import React from "react";

/**
 * ConfirmDeleteModal
 *
 * Backward compatible props (current usage):
 * - isOpen: boolean
 * - target: { name?: string, ids?: string[] } | any
 * - busy: boolean
 * - onCancel: () => void
 * - onConfirm: () => void
 *
 * Preferred props going forward (optional):
 * - count?: number
 * - itemName?: string
 */
const ConfirmDeleteModal = ({
  isOpen,
  target,
  busy,
  onCancel,
  onConfirm,
  count,
  itemName,
}) => {
  // If consumer passes explicit count/name, use those; otherwise infer from `target`.
  const inferredCount =
    typeof count === "number"
      ? count
      : Array.isArray(target?.ids)
        ? target.ids.length
        : 1;

  const inferredName =
    typeof itemName === "string" ? itemName : target?.name || "";

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/60 z-50"
      onClick={() => {
        if (busy) return;
        onCancel();
      }}
    >
      <div
        className="bg-surface p-6 rounded-xl w-[90%] max-w-sm shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-accent mb-2">
          {inferredCount > 1 ? "Delete selected items?" : "Delete item?"}
        </h3>

        <p className="text-sm text-gray-300 mb-4">
          {inferredCount > 1 ? (
            <>
              This will permanently delete{" "}
              <span className="font-semibold text-text">{inferredCount}</span>{" "}
              item(s).
            </>
          ) : (
            <>
              This will permanently delete{" "}
              <span className="font-semibold text-text">
                {inferredName ? `"${inferredName}"` : "this item"}
              </span>
              .
            </>
          )}
        </p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="btn-danger"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDeleteModal;
