import React, { useCallback, useRef, useState } from "react";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";

/**
 * Promise-based replacement for window.confirm:
 *
 *   const [confirm, confirmDialog] = useConfirm();
 *   if (!(await confirm({ title, message, confirmLabel, danger: true }))) return;
 *   ...
 *   return <>{page}{confirmDialog}</>;
 *
 * Resolves true on confirm, false on cancel, Escape or an outside click.
 */
export default function useConfirm() {
  const [options, setOptions] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        resolveRef.current?.(false); // a second confirm cancels a pending one
        resolveRef.current = resolve;
        setOptions(opts);
      }),
    [],
  );

  const settle = (value) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setOptions(null);
  };

  const dialog = (
    <ConfirmDialog
      isOpen={options != null}
      title={options?.title ?? ""}
      message={options?.message}
      confirmLabel={options?.confirmLabel}
      cancelLabel={options?.cancelLabel}
      danger={options?.danger}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );

  return [confirm, dialog];
}
