import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useTheme from "./useTheme";

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.className = "";
});

describe("useTheme with blocked storage (L6)", () => {
  it("defaults to dark and still toggles instead of throwing", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });
});
