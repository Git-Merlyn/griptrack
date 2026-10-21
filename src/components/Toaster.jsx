// src/components/Toaster.jsx
// Renders the toast stack from src/lib/toast.js. Mounted once in main.jsx,
// OUTSIDE the ErrorBoundary, so toasts still show on the crash screen.
import { useSyncExternalStore } from "react";
import { dismiss, getToasts, subscribe } from "@/lib/toast";

const BORDER = {
  success: "border-success/40",
  error: "border-danger/50",
  info: "border-text/20",
};

const BADGE = {
  success: "bg-success/20 text-success",
  error: "bg-danger/20 text-danger",
  info: "bg-text/10 text-text/70",
};

const ICON = { success: "✓", error: "!", info: "i" };

export default function Toaster() {
  const toasts = useSyncExternalStore(subscribe, getToasts, getToasts);
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-[10000] flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:w-96">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.type === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface px-4 py-3 text-sm text-text shadow-lg ${BORDER[t.type] ?? BORDER.info}`}
        >
          <span
            aria-hidden="true"
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${BADGE[t.type] ?? BADGE.info}`}
          >
            {ICON[t.type] ?? ICON.info}
          </span>
          <p className="min-w-0 flex-1 break-words">{t.message}</p>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss notification"
            className="shrink-0 text-text/50 hover:text-text"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
