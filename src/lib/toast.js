// src/lib/toast.js
// Dependency-free toast store. Call toast.success / toast.error / toast.info
// (or toast(msg)) from anywhere — React or not. <Toaster /> renders the stack.
//
// installGlobalToast() also exposes it as window.toast, which the ~50 legacy
// `window.toast?.success?.(...)` call sites use. Before this existed nothing
// ever assigned window.toast, so every one of those calls was a silent no-op.

const DURATION_MS = { success: 3500, info: 4500, error: 7000 };
const MAX_VISIBLE = 4;

let toasts = [];
let nextId = 1;
const timers = new Map();
const listeners = new Set();

function emit() {
  for (const listener of listeners) listener();
}

function toText(message) {
  if (message == null) return "";
  if (typeof message === "string") return message.trim();
  if (typeof message.message === "string") return message.message.trim();
  return String(message).trim();
}

function clearTimer(id) {
  clearTimeout(timers.get(id));
  timers.delete(id);
}

function schedule(id, type) {
  clearTimer(id);
  timers.set(
    id,
    setTimeout(() => dismiss(id), DURATION_MS[type] ?? DURATION_MS.info),
  );
}

export function dismiss(id) {
  clearTimer(id);
  const next = toasts.filter((t) => t.id !== id);
  if (next.length !== toasts.length) {
    toasts = next;
    emit();
  }
}

function push(type, message) {
  const text = toText(message);
  if (!text) return null;

  // The same message is already on screen (e.g. a context helper and the page
  // both report one failure): restart its timer instead of stacking a copy.
  const dup = toasts.find((t) => t.type === type && t.message === text);
  if (dup) {
    schedule(dup.id, type);
    return dup.id;
  }

  const id = nextId++;
  toasts = [...toasts, { id, type, message: text }];
  while (toasts.length > MAX_VISIBLE) {
    clearTimer(toasts[0].id);
    toasts = toasts.slice(1);
  }
  schedule(id, type);
  emit();
  return id;
}

export const toast = Object.assign((message) => push("info", message), {
  success: (message) => push("success", message),
  error: (message) => push("error", message),
  info: (message) => push("info", message),
  dismiss,
});

// useSyncExternalStore contract: subscribe(callback) -> unsubscribe.
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Returns the same array instance until something changes (required by
// useSyncExternalStore to avoid render loops).
export function getToasts() {
  return toasts;
}

export function installGlobalToast() {
  if (typeof window !== "undefined") window.toast = toast;
  return toast;
}

// Tests only: drop every toast and pending timer.
export function resetToastsForTests() {
  for (const id of timers.keys()) clearTimeout(timers.get(id));
  timers.clear();
  toasts = [];
  emit();
}
