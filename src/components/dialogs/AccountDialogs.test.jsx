import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const invoke = vi.fn();
const updateUser = vi.fn();
vi.mock("@/lib/supabaseClient", () => ({ supabase: { functions: { invoke: (...a) => invoke(...a) }, auth: { updateUser: (...a) => updateUser(...a) } } }));
const signOut = vi.fn();
vi.mock("@/lib/signOut", () => ({ signOutWithLocalFallback: (...a) => signOut(...a) }));

import { ChangePasswordDialog, DeleteAccountDialog } from "./AccountDialogs";
import AccountDeletedOverlay from "./AccountDeletedOverlay";

beforeEach(() => {
  invoke.mockReset();
  updateUser.mockReset();
  signOut.mockReset();
});

describe("ChangePasswordDialog", () => {
  it("is a centred dialog that saves a new password", async () => {
    const user = userEvent.setup();
    updateUser.mockResolvedValue({ error: null });
    render(<ChangePasswordDialog isOpen onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Change password" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("New password"), "longenough1");
    await user.type(screen.getByLabelText("Confirm new password"), "longenough1");
    await user.click(screen.getByRole("button", { name: "Save password" }));
    expect(updateUser).toHaveBeenCalledWith({ password: "longenough1" });
    expect(await screen.findByText("Password updated.")).toBeInTheDocument();
  });

  it("refuses mismatched passwords", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordDialog isOpen onClose={() => {}} />);
    await user.type(screen.getByLabelText("New password"), "longenough1");
    await user.type(screen.getByLabelText("Confirm new password"), "different22");
    await user.click(screen.getByRole("button", { name: "Save password" }));
    expect(screen.getByText("Passwords don't match")).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("keeps typed input: an outside click or Escape does not close it", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ChangePasswordDialog isOpen onClose={onClose} />);
    await user.type(screen.getByLabelText("New password"), "abc");
    await user.pointer({ keys: "[MouseLeft]", target: screen.getByTestId("dialog-overlay") });
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("DeleteAccountDialog", () => {
  it("needs DELETE typed before the button works", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountDialog isOpen onClose={() => {}} isOwner={false} />);
    expect(screen.getByRole("button", { name: "Permanently delete my account" })).toBeDisabled();
    await user.type(screen.getByLabelText(/to confirm/), "DELETE");
    expect(screen.getByRole("button", { name: "Permanently delete my account" })).toBeEnabled();
  });

  it("shows the server's reason when deletion is blocked", async () => {
    const user = userEvent.setup();
    invoke.mockResolvedValue({ data: { error: "Remove the other members first." }, error: null });
    render(<DeleteAccountDialog isOpen onClose={() => {}} isOwner />);
    await user.type(screen.getByLabelText(/to confirm/), "DELETE");
    await user.click(screen.getByRole("button", { name: "Permanently delete my account" }));
    expect(await screen.findByText("Remove the other members first.")).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("covers the app with the 'deleted' overlay before signing out (no sign-in flash)", async () => {
    const user = userEvent.setup();
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    let overlayVisibleAtSignOut = null;
    signOut.mockImplementation(async () => {
      overlayVisibleAtSignOut = screen.queryByText("Your account has been deleted.") != null;
    });
    const hrefSetter = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, set href(v) { hrefSetter(v); } } });
    try {
      render(
        <>
          <AccountDeletedOverlay />
          <DeleteAccountDialog isOpen onClose={() => {}} isOwner={false} />
        </>,
      );
      await user.type(screen.getByLabelText(/to confirm/), "DELETE");
      await user.click(screen.getByRole("button", { name: "Permanently delete my account" }));
      await waitFor(() => expect(hrefSetter).toHaveBeenCalledWith("/"));
      expect(overlayVisibleAtSignOut).toBe(true);
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: original });
    }
  });
});
