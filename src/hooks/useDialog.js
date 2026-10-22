import { useEffect, useId, useRef } from "react";

// Modal dialog behaviour shared by every overlay:
// - moves focus into the dialog when it opens and restores it on close
// - keeps Tab / Shift+Tab inside the dialog
// - Escape calls onClose
// Only the top-most open dialog reacts to keys, so Escape in "Add New
// Location" (opened on top of the Edit or Move modal) closes just that one.
//
// Usage — call it before any early `return null`:
//   const { panelRef, titleId } = useDialog({ isOpen, onClose });
//   <div ref={panelRef} role="dialog" aria-modal="true"
//        aria-labelledby={titleId} tabIndex={-1}>
//     <h3 id={titleId}>Title</h3> ...

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

// Open dialogs, oldest first. Module-level on purpose: one per page.
const openStack = [];

export default function useDialog({ isOpen, onClose, closeOnEscape = true }) {
  const panelRef = useRef(null);
  const titleId = useId();

  // Latest callbacks without re-running the open/close effect.
  const onCloseRef = useRef(onClose);
  const closeOnEscapeRef = useRef(closeOnEscape);
  useEffect(() => {
    onCloseRef.current = onClose;
    closeOnEscapeRef.current = closeOnEscape;
  });

  useEffect(() => {
    if (!isOpen) return undefined;

    const token = {};
    openStack.push(token);
    const previouslyFocused = document.activeElement;

    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      const first =
        panel.querySelector("[data-autofocus]") || panel.querySelector(FOCUSABLE);
      (first || panel).focus({ preventScroll: true });
    }

    const onKeyDown = (e) => {
      if (openStack[openStack.length - 1] !== token) return;
      const node = panelRef.current;
      if (!node) return;

      if (e.key === "Escape") {
        if (!closeOnEscapeRef.current) return;
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }

      if (e.key !== "Tab") return;
      const items = Array.from(node.querySelectorAll(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        node.focus({ preventScroll: true });
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstItem || !node.contains(active))) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && (active === lastItem || !node.contains(active))) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const i = openStack.indexOf(token);
      if (i !== -1) openStack.splice(i, 1);
      if (
        previouslyFocused &&
        typeof previouslyFocused.focus === "function" &&
        document.contains(previouslyFocused)
      ) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [isOpen]);

  return { panelRef, titleId };
}
