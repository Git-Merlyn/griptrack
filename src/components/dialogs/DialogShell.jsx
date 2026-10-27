import React from "react";
import useDialog from "@/hooks/useDialog";

/**
 * Small centred dialog: focus trap, Escape and outside-click handling via
 * useDialog. Use it instead of window.confirm / alert and for short forms.
 *
 * closeOnOverlay / closeOnEscape let a form stay open while it has unsaved
 * input, so one stray click cannot throw away what the user typed.
 */
export default function DialogShell({
  isOpen,
  onClose,
  title,
  children,
  closeOnOverlay = true,
  closeOnEscape = true,
  tone = "default", // "default" | "danger": colours the title
  size = "md", // "md" | "wide" (e.g. the PDF layout teacher)
}) {
  const { panelRef, titleId } = useDialog({ isOpen, onClose, closeOnEscape });
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) onClose?.();
      }}
      data-testid="dialog-overlay"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`bg-surface border border-text/10 rounded-xl shadow-2xl w-full ${size === "wide" ? "max-w-3xl" : "max-w-md"} max-h-[calc(100dvh-32px)] overflow-y-auto`}
      >
        <h2
          id={titleId}
          className={`px-5 pt-5 pb-2 text-base font-semibold ${tone === "danger" ? "text-danger" : "text-heading"}`}
        >
          {title}
        </h2>
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>
  );
}
