import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EditModal from "./EditModal";

function renderEditModal(overrides = {}) {
  const props = {
    isOpen: true,
    variant: "desktop",
    title: "Edit Item",
    editingId: "row-1",
    newItem: {
      name: "C-Stand",
      category: "Stands",
      source: "Dean",
      location: "Truck 1",
      status: "Available",
      quantity: 1,
      reserveMin: 0,
      rentalStart: "",
      rentalEnd: "",
    },
    allLocations: ["Truck 1", "Truck 2"],
    statusOptions: ["Available", "Out", "Damaged"],
    onChangeField: vi.fn(),
    onRequestAddLocation: vi.fn(),
    onCancel: vi.fn(),
    onSave: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };

  render(<EditModal {...props} />);
  return props;
}

describe("EditModal UI guards", () => {
  it("Quantity input allows typing 2 and 3 (no min=1 / controlled input trap)", async () => {
    const user = userEvent.setup();
    const props = renderEditModal({
      newItem: { quantity: "" }, // simulate the 'blank while typing' state
    });

    // Grab by its label text
    const numberInputs = screen.getAllByRole("spinbutton");
    const qtyInput = numberInputs[0]; // Quantity
    await user.clear(qtyInput);

    await user.type(qtyInput, "2");
    expect(props.onChangeField).toHaveBeenCalledWith("quantity", 2);

    await user.clear(qtyInput);
    await user.type(qtyInput, "3");
    expect(props.onChangeField).toHaveBeenCalledWith("quantity", 3);
  });

  it("Clicking Delete calls onDelete and does not close modal automatically", async () => {
    const user = userEvent.setup();
    const props = renderEditModal({
      newItem: { name: "Apple Box", quantity: 5, reserveMin: 1 },
    });

    // Modal is open
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(props.onDelete).toHaveBeenCalledWith("row-1", "Apple Box");
    // Still open because isOpen is controlled by parent and we didn't change it in the test
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Clicking overlay triggers onCancel (but clicking inside does not)", async () => {
    const user = userEvent.setup();
    const props = renderEditModal();

    // Clicking inside modal should not cancel
    await user.click(screen.getByText("Edit Item"));
    expect(props.onCancel).not.toHaveBeenCalled();

    // Clicking overlay should cancel
    await user.click(screen.getByRole("dialog")); // overlay div has role="dialog"
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });
});
