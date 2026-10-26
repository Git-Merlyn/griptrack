import React from "react";
import DialogShell from "./DialogShell";

/**
 * In-app replacement for window.confirm. For a danger confirmation the Cancel
 * button gets focus first, so pressing Return never confirms by accident.
 */
export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}) {
  return (
    <DialogShell isOpen={isOpen} onClose={onCancel} title={title} tone={danger ? "danger" : "default"}>
      {message && <div className="text-sm text-text/80 leading-relaxed mb-5">{message}</div>}
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel} data-autofocus={danger ? true : undefined}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={danger ? "btn-danger" : "btn-accent"}
          onClick={onConfirm}
          data-autofocus={danger ? undefined : true}
        >
          {confirmLabel}
        </button>
      </div>
    </DialogShell>
  );
}
