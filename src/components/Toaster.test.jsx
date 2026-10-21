import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
// ?raw = file contents as a string (Vite feature, works in vitest)
import mainSource from "../main.jsx?raw";
import Toaster from "./Toaster";
import { toast, getToasts, installGlobalToast, resetToastsForTests } from "@/lib/toast";

beforeEach(() => {
  resetToastsForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("installGlobalToast", () => {
  it("defines window.toast with success/error/info (the legacy call-site API)", () => {
    delete window.toast;
    installGlobalToast();
    expect(typeof window.toast).toBe("function");
    expect(typeof window.toast?.success).toBe("function");
    expect(typeof window.toast?.error).toBe("function");
    expect(typeof window.toast?.info).toBe("function");
  });

  it("main.jsx installs the global and mounts <Toaster /> (guards against M3 regressing)", () => {
    const main = mainSource;
    expect(main).toMatch(/installGlobalToast\(\);/);
    expect(main).toMatch(/<Toaster \/>/);
    // Toaster must sit outside the ErrorBoundary so the crash screen can toast.
    expect(main.indexOf("<Toaster />")).toBeGreaterThan(main.indexOf("</ErrorBoundary>"));
  });
});

describe("<Toaster />", () => {
  it("renders an error toast as an alert and a success toast as a status", () => {
    render(<Toaster />);
    act(() => {
      toast.error("Delete failed");
      toast.success("Item moved");
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Delete failed");
    expect(screen.getByRole("status")).toHaveTextContent("Item moved");
  });

  it("collapses an identical message instead of stacking a duplicate", () => {
    render(<Toaster />);
    act(() => {
      toast.error("Failed to delete item");
      toast.error("Failed to delete item");
    });
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("accepts Error objects and ignores empty messages", () => {
    act(() => {
      toast.error(new Error("boom"));
      toast.info("");
      toast.info(null);
    });
    expect(getToasts().map((t) => t.message)).toEqual(["boom"]);
  });

  it("keeps at most 4 toasts", () => {
    act(() => {
      for (let i = 1; i <= 6; i++) toast.info(`n${i}`);
    });
    expect(getToasts().map((t) => t.message)).toEqual(["n3", "n4", "n5", "n6"]);
  });

  it("auto-dismisses (success after 3.5 s, error after 7 s)", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      toast.success("saved");
      toast.error("broken");
    });
    act(() => vi.advanceTimersByTime(3600));
    expect(screen.queryByText("saved")).toBeNull();
    expect(screen.getByText("broken")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3500));
    expect(screen.queryByText("broken")).toBeNull();
  });

  it("dismiss button removes the toast", () => {
    render(<Toaster />);
    act(() => {
      toast.info("hello");
    });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(screen.queryByText("hello")).toBeNull();
  });
});
