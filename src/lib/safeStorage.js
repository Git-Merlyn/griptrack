// src/lib/safeStorage.js
// localStorage that never throws (audit L6). Safari with "Block all cookies",
// some embedded webviews and sandboxed iframes throw a SecurityError on any
// localStorage access (even reading window.localStorage). Unguarded, that
// error escapes a render or effect and sends the whole app to the
// ErrorBoundary. Reads return null and writes return false instead.

export function safeGetItem(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetItem(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemoveItem(key) {
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
