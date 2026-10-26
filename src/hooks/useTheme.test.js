import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useTheme, { MODE_KEY } from "./useTheme";

let listeners;
function mockSystem(prefersLight) {
  listeners = [];
  const mql = {
    matches: prefersLight,
    addEventListener: (_t, cb) => listeners.push(cb),
    removeEventListener: (_t, cb) => { listeners = listeners.filter((l) => l !== cb); },
  };
  window.matchMedia = vi.fn().mockImplementation(() => mql);
  return mql;
}

describe("useTheme (System / Light / Dark)", () => {
  const originalMatchMedia = window.matchMedia;
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
  });
  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    window.matchMedia = originalMatchMedia;
  });

  it("defaults to System and follows a dark computer setting", () => {
    mockSystem(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.mode).toBe("system");
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  it("System follows a light computer setting, and live changes", () => {
    mockSystem(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    act(() => listeners.forEach((l) => l({ matches: false })));
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  it("does not save anything until the user chooses", () => {
    mockSystem(false);
    renderHook(() => useTheme());
    expect(localStorage.getItem(MODE_KEY)).toBeNull();
  });

  it("an explicit choice is saved and overrides the computer", () => {
    mockSystem(true);
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setMode("dark"));
    expect(localStorage.getItem(MODE_KEY)).toBe("dark");
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  it("keeps an old explicit Light choice (gt_theme=light)", () => {
    mockSystem(false);
    localStorage.setItem("gt_theme", "light");
    const { result } = renderHook(() => useTheme());
    expect(result.current.mode).toBe("light");
    expect(result.current.theme).toBe("light");
  });

  it("treats the old automatic gt_theme=dark as System", () => {
    mockSystem(true);
    localStorage.setItem("gt_theme", "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.mode).toBe("system");
    expect(result.current.theme).toBe("light");
  });

  it("toggleTheme still flips to the opposite explicit theme", () => {
    mockSystem(false);
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggleTheme());
    expect(result.current.mode).toBe("light");
    expect(localStorage.getItem(MODE_KEY)).toBe("light");
  });
});
