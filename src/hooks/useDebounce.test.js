import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useDebounce from "./useDebounce";

describe("useDebounce", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value immediately", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDebounce("hello", 300));
    expect(result.current).toBe("hello");
  });

  it("does not update before the delay elapses", () => {
    vi.useFakeTimers();
    let value = "initial";
    const { result, rerender } = renderHook(() => useDebounce(value, 300));

    value = "updated";
    rerender();

    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe("initial");
  });

  it("updates after the delay elapses", () => {
    vi.useFakeTimers();
    let value = "initial";
    const { result, rerender } = renderHook(() => useDebounce(value, 300));

    value = "updated";
    rerender();

    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe("updated");
  });

  it("resets the timer when value changes before delay completes", () => {
    vi.useFakeTimers();
    let value = "a";
    const { result, rerender } = renderHook(() => useDebounce(value, 300));

    value = "b";
    rerender();
    act(() => vi.advanceTimersByTime(200)); // 200ms into "b" — not yet flushed

    value = "c";
    rerender();
    act(() => vi.advanceTimersByTime(200)); // 200ms into "c", 400ms total — still not 300ms since "c"
    expect(result.current).toBe("a");      // still showing initial

    act(() => vi.advanceTimersByTime(100)); // now 300ms since "c"
    expect(result.current).toBe("c");
  });

  it("defaults to 200ms delay", () => {
    vi.useFakeTimers();
    let value = "x";
    const { result, rerender } = renderHook(() => useDebounce(value));

    value = "y";
    rerender();

    act(() => vi.advanceTimersByTime(199));
    expect(result.current).toBe("x");

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("y");
  });

  it("works with non-string values (numbers, objects)", () => {
    vi.useFakeTimers();
    let value = 0;
    const { result, rerender } = renderHook(() => useDebounce(value, 100));

    value = 42;
    rerender();

    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe(42);
  });
});
