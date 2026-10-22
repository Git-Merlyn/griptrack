import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MoveModal from "./MoveModal";

function renderMove({ quantity = 5, location = "Truck 1", moveData = { qty: 1, newLocation: "" } } = {}) {
  const props = {
    isOpen: true,
    movingItem: { id: "a", name: "C-Stand", quantity, location },
    moveData,
    setMoveData: vi.fn(),
    allLocations: ["Truck 1", "Stage 2"],
    onRequestAddLocation: vi.fn(),
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
  };
  render(<MoveModal {...props} />);
  return props;
}

describe("MoveModal", () => {
  it("is a labelled dialog with labelled fields (M8)", () => {
    renderMove();
    expect(screen.getByRole("dialog", { name: "Move C-Stand" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Quantity to move/)).toBeInTheDocument();
    expect(screen.getByLabelText("New location:")).toBeInTheDocument();
  });

  it("disables Confirm and says why when no destination is chosen (L16)", async () => {
    const user = userEvent.setup();
    const props = renderMove();
    const confirm = screen.getByRole("button", { name: "Confirm Move" });
    expect(confirm).toBeDisabled();
    expect(screen.getByText("Choose a destination.")).toBeInTheDocument();
    await user.click(confirm);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it("explains that a quantity-0 item has nothing to move (L16)", () => {
    renderMove({ quantity: 0, moveData: { qty: 0, newLocation: "Stage 2" } });
    expect(screen.getByRole("button", { name: "Confirm Move" })).toBeDisabled();
    expect(screen.getByText("Nothing to move: this item's quantity is 0.")).toBeInTheDocument();
  });

  it("rejects a quantity above the maximum", () => {
    renderMove({ moveData: { qty: 9, newLocation: "Stage 2" } });
    expect(screen.getByRole("button", { name: "Confirm Move" })).toBeDisabled();
    expect(screen.getByText("Enter a quantity from 1 to 5.")).toBeInTheDocument();
  });

  it("rejects moving to the item's current location", () => {
    renderMove({ moveData: { qty: 1, newLocation: "Truck 1" } });
    expect(screen.getByRole("button", { name: "Confirm Move" })).toBeDisabled();
    expect(screen.getByText("The item is already at this location.")).toBeInTheDocument();
  });

  it("offers Add new location when the parent passes a handler", () => {
    renderMove();
    expect(screen.getByRole("option", { name: "➕ Add new location..." })).toBeInTheDocument();
  });

  it("hides Add new location when no handler is passed (crew, D63 = B)", () => {
    render(
      <MoveModal
        isOpen
        movingItem={{ id: "a", name: "C-Stand", quantity: 5, location: "Truck 1" }}
        moveData={{ qty: 1, newLocation: "" }}
        setMoveData={vi.fn()}
        allLocations={["Truck 1", "Stage 2"]}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByRole("option", { name: /Add new location/ })).toBeNull();
    expect(screen.getByRole("option", { name: "Stage 2" })).toBeInTheDocument();
  });

  it("enables Confirm for a valid move", async () => {
    const user = userEvent.setup();
    const props = renderMove({ moveData: { qty: 2, newLocation: "Stage 2" } });
    const confirm = screen.getByRole("button", { name: "Confirm Move" });
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });
});
