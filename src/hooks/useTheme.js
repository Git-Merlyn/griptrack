// src/hooks/useTheme.js
// Manages dark/light theme. Dark is the default.
// Persists preference to localStorage and applies the .light class to <html>.

import { useEffect, useState } from "react";

const STORAGE_KEY = "gt_theme";

export default function useTheme() {
  const [theme, setThemeState] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light");
    } else {
      root.classList.remove("light");
    }
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setThemeState((t) => (t === "dark" ? "light" : "dark"));
  const isDark = theme === "dark";

  return { theme, isDark, toggleTheme };
}
