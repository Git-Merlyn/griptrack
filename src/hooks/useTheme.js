// src/hooks/useTheme.js
// Theme mode: "system" (default, follows the OS), "light" or "dark".
// Applies the .light class to <html>. index.html runs the same rules before
// React mounts, so the first paint already has the right theme.

import { useCallback, useEffect, useState } from "react";
import { safeGetItem, safeSetItem } from "@/lib/safeStorage";

export const MODE_KEY = "gt_theme_mode";
// Before TODO 9.19 the app stored "dark" for everyone on first load, so an
// old "dark" cannot be told apart from "never chose". Only an old "light" is
// an explicit choice; everything else starts on System.
const LEGACY_KEY = "gt_theme";
const MODES = new Set(["system", "light", "dark"]);
const QUERY = "(prefers-color-scheme: light)";

export function readMode() {
  const stored = safeGetItem(MODE_KEY);
  if (MODES.has(stored)) return stored;
  return safeGetItem(LEGACY_KEY) === "light" ? "light" : "system";
}

function systemPrefersLight() {
  try {
    return Boolean(window.matchMedia?.(QUERY).matches);
  } catch {
    return false;
  }
}

export default function useTheme() {
  const [mode, setModeState] = useState(readMode);
  const [prefersLight, setPrefersLight] = useState(systemPrefersLight);

  // Follow the OS setting live while on System.
  useEffect(() => {
    if (mode !== "system") return undefined;
    let mql;
    try {
      mql = window.matchMedia?.(QUERY);
    } catch {
      mql = null;
    }
    if (!mql) return undefined;
    const onChange = (e) => setPrefersLight(e.matches);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [mode]);

  const theme = mode === "system" ? (prefersLight ? "light" : "dark") : mode;

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  // Persist only an explicit choice, never the default.
  const setMode = useCallback((next) => {
    if (!MODES.has(next)) return;
    safeSetItem(MODE_KEY, next);
    setModeState(next);
  }, []);

  // Kept for older callers: flips to the opposite explicit theme.
  const toggleTheme = useCallback(() => setMode(theme === "dark" ? "light" : "dark"), [setMode, theme]);

  return { mode, setMode, theme, isDark: theme === "dark", toggleTheme };
}
