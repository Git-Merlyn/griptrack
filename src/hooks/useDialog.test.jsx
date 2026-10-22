import React, { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import useDialog from "./useDialog";

function Dialog({ isOpen, onClose, title, closeOnEscape, children }) {
  const { panelRef, titleId } = useDialog({ isOpen, onClose, closeOnEscape });
  if (!isOpen) return null;
  return (
    <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <h3 id={titleId}>{title}</h3>
      {children}
    </div>
  );
}

function Harness({ onCloseOuter = () => {}, onCloseInner = () => {} }) {
  const [outer, setOuter] = useState(false);
  const [inner, setInner] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOuter(true)}>Open outer</button>
      <Dialog
        isOpen={outer}
        title="Outer"
        onClose={() => {
          onCloseOuter();
          setOuter(false);
        }}
      >
        <input aria-label="Outer field" />
        <button type="button" onClick={() => setInner(true)}>Open inner</button>
      </Dialog>
      <Dialog
        isOpen={inner}
        title="Inner"
        onClose={() => {
          onCloseInner();
          setInner(false);
        }}
      >
        <button type="button">Inner first</button>
        <button type="button">Inner last</button>
      </Dialog>
    </>
  );
}

describe("useDialog", () => {
  it("labels the dialog by its title", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open outer" }));
    expect(screen.getByRole("dialog", { name: "Outer" })).toBeInTheDocument();
  });

  it("focuses the first control on open and restores focus on close", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open outer" });
    await user.click(opener);
    expect(screen.getByLabelText("Outer field")).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("Escape closes only the top-most dialog", async () => {
    const user = userEvent.setup();
    const onCloseOuter = vi.fn();
    const onCloseInner = vi.fn();
    render(<Harness onCloseOuter={onCloseOuter} onCloseInner={onCloseInner} />);
    await user.click(screen.getByRole("button", { name: "Open outer" }));
    await user.click(screen.getByRole("button", { name: "Open inner" }));

    await user.keyboard("{Escape}");
    expect(onCloseInner).toHaveBeenCalledTimes(1);
    expect(onCloseOuter).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Outer" })).toBeInTheDocument();
    // Focus went back to the control that opened the inner dialog
    expect(screen.getByRole("button", { name: "Open inner" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(onCloseOuter).toHaveBeenCalledTimes(1);
  });

  it("Tab and Shift+Tab wrap inside the dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open outer" }));
    await user.click(screen.getByRole("button", { name: "Open inner" }));
    const first = screen.getByRole("button", { name: "Inner first" });
    const last = screen.getByRole("button", { name: "Inner last" });
    expect(first).toHaveFocus();

    await user.tab();
    expect(last).toHaveFocus();
    await user.tab();
    expect(first).toHaveFocus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it("closeOnEscape=false ignores Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Dialog isOpen title="Busy" onClose={onClose} closeOnEscape={false}><button>OK</button></Dialog>);
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });
});
