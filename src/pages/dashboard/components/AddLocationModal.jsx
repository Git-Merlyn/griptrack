import React, { useId } from "react";
import useDialog from "@/hooks/useDialog";

const AddLocationModal = ({
  isOpen,
  value,
  onChange,
  onCancel,
  onAdd,
  busy = false,
}) => {
  const inputId = useId();
  const { panelRef, titleId } = useDialog({ isOpen, onClose: onCancel });

  if (!isOpen) return null;

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
        className="bg-surface p-6 rounded-xl w-[90%] max-w-sm shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="text-lg font-bold text-accent mb-4">
          Add New Location
        </h3>
        <label htmlFor={inputId} className="sr-only">
          New location name
        </label>
        <input
          id={inputId}
          type="text"
          placeholder="New location name"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) {
              e.preventDefault();
              onAdd();
            }
          }}
          className="w-full px-3 py-2 mb-4 rounded bg-white text-black"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={onAdd}
            disabled={busy}
            className={busy ? "btn-disabled" : "btn-accent"}
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddLocationModal;
