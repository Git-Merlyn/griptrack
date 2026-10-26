import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useTheme from "./useTheme";

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.className = "";
});

describe("useTheme with blocked storage (L6)", () => {
  it("falls back to System and still switches instead of throwing", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });
    const { result } = renderHook(() => useTheme());
    expect(result.current.mode).toBe("system");
    act(() => result.current.setMode("light"));
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });
});
