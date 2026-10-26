import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import useConfirm from "./useConfirm";

function Harness({ onResult, danger = false }) {
  const [confirm, dialog] = useConfirm();
  return (
    <>
      <button
        type="button"
        onClick={async () => onResult(await confirm({ title: "Remove member?", message: "They lose access.", confirmLabel: "Remove", danger }))}
      >
        open
      </button>
      {dialog}
    </>
  );
}

describe("useConfirm", () => {
  it("shows an in-app dialog and resolves true on confirm", async () => {
    const user = userEvent.setup();
    const results = [];
    render(<Harness onResult={(r) => results.push(r)} />);
    await user.click(screen.getByText("open"));
    expect(screen.getByRole("dialog", { name: "Remove member?" })).toHaveTextContent("They lose access.");
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(results).toEqual([true]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("resolves false on Cancel, on Escape and on an outside click", async () => {
    const user = userEvent.setup();
    const results = [];
    render(<Harness onResult={(r) => results.push(r)} />);

    await user.click(screen.getByText("open"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByText("open"));
    await user.keyboard("{Escape}");

    await user.click(screen.getByText("open"));
    await user.pointer({ keys: "[MouseLeft]", target: screen.getByTestId("dialog-overlay") });

    expect(results).toEqual([false, false, false]);
  });

  it("puts focus on Cancel for a destructive confirmation", async () => {
    const user = userEvent.setup();
    render(<Harness onResult={() => {}} danger />);
    await user.click(screen.getByText("open"));
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });
});
