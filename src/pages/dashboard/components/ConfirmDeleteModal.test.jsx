import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmDeleteModal from "./ConfirmDeleteModal";

describe("ConfirmDeleteModal UI guards", () => {
  it("renders single-item text when count is 1 and name is provided", () => {
    render(
      <ConfirmDeleteModal
        isOpen={true}
        target={{ name: "C-Stand" }}
        busy={false}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );

    expect(screen.getByText("Delete item?")).toBeInTheDocument();
    expect(screen.getByText(/"C-Stand"/)).toBeInTheDocument();
  });

  it("renders bulk text when target.ids has multiple items", () => {
    render(
      <ConfirmDeleteModal
        isOpen={true}
        target={{ ids: ["a", "b", "c"] }}
        busy={false}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );

    expect(screen.getByText("Delete selected items?")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("overlay click cancels when not busy, and does nothing when busy", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    const { rerender } = render(
      <ConfirmDeleteModal
        isOpen={true}
        target={{ name: "X" }}
        busy={false}
        onCancel={onCancel}
        onConfirm={() => {}}
      />,
    );

    // Click overlay (outside inner box)
    await user.click(
      screen.getByText("Delete item?").closest("div")?.parentElement,
    );
    expect(onCancel).toHaveBeenCalledTimes(1);

    // Now busy
    rerender(
      <ConfirmDeleteModal
        isOpen={true}
        target={{ name: "X" }}
        busy={true}
        onCancel={onCancel}
        onConfirm={() => {}}
      />,
    );

    await user.click(
      screen.getByText("Delete item?").closest("div")?.parentElement,
    );
    expect(onCancel).toHaveBeenCalledTimes(1); // unchanged
  });

  it("Cancel and Delete buttons call handlers", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ConfirmDeleteModal
        isOpen={true}
        target={{ name: "X" }}
        busy={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
