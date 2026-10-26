import React, { useState } from "react";
import DialogShell from "./DialogShell";
import { supabase } from "@/lib/supabaseClient";
import { signOutWithLocalFallback } from "@/lib/signOut";
import { announceAccountDeleted } from "./accountDeletedEvent";

const inputClass =
  "w-full px-3 py-2 rounded bg-background text-text border border-text/15 text-sm placeholder:text-text/40 focus:outline-hidden focus:ring-2 focus:ring-accent/40";

/** Change password, as a centred dialog (was a view inside the corner menu). */
export function ChangePasswordDialog({ isOpen, onClose }) {
  const [state, setState] = useState({ next: "", confirm: "", busy: false, err: "", ok: false });
  const dirty = !state.ok && (state.next !== "" || state.confirm !== "");

  const close = () => {
    setState({ next: "", confirm: "", busy: false, err: "", ok: false });
    onClose();
  };

  const save = async (e) => {
    e.preventDefault();
    if (state.next !== state.confirm) {
      setState((s) => ({ ...s, err: "Passwords don't match" }));
      return;
    }
    if (state.next.length < 8) {
      setState((s) => ({ ...s, err: "Password must be at least 8 characters" }));
      return;
    }
    setState((s) => ({ ...s, busy: true, err: "" }));
    const { error } = await supabase.auth.updateUser({ password: state.next });
    if (error) setState((s) => ({ ...s, busy: false, err: error.message }));
    else setState({ next: "", confirm: "", busy: false, err: "", ok: true });
  };

  return (
    <DialogShell
      isOpen={isOpen}
      onClose={close}
      title="Change password"
      closeOnOverlay={!dirty && !state.busy}
      closeOnEscape={!dirty && !state.busy}
    >
      {state.ok ? (
        <div className="flex flex-col gap-4">
          <p className="text-success text-sm">Password updated.</p>
          <button type="button" className="btn-accent" onClick={close} data-autofocus>
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={save} className="flex flex-col gap-3">
          <input
            type="password"
            placeholder="New password"
            aria-label="New password"
            autoComplete="new-password"
            value={state.next}
            onChange={(e) => setState((s) => ({ ...s, next: e.target.value, err: "" }))}
            className={inputClass}
            required
            minLength={8}
            data-autofocus
          />
          <input
            type="password"
            placeholder="Confirm new password"
            aria-label="Confirm new password"
            autoComplete="new-password"
            value={state.confirm}
            onChange={(e) => setState((s) => ({ ...s, confirm: e.target.value, err: "" }))}
            className={inputClass}
            required
          />
          {state.err && <p className="text-danger text-xs">{state.err}</p>}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary" onClick={close} disabled={state.busy}>
              Cancel
            </button>
            <button type="submit" disabled={state.busy} className={state.busy ? "btn-disabled" : "btn-accent"}>
              {state.busy ? "Saving…" : "Save password"}
            </button>
          </div>
        </form>
      )}
    </DialogShell>
  );
}

/** Delete account, as a centred dialog. Requires typing DELETE. */
export function DeleteAccountDialog({ isOpen, onClose, isOwner }) {
  const [state, setState] = useState({ confirm: "", busy: false, err: "" });
  const dirty = state.confirm !== "";

  const close = () => {
    setState({ confirm: "", busy: false, err: "" });
    onClose();
  };

  const remove = async (e) => {
    e.preventDefault();
    if (state.confirm !== "DELETE") return;
    setState((s) => ({ ...s, busy: true, err: "" }));
    try {
      // Edge function: cancels any live Stripe subscription, then runs the
      // delete_my_account RPC. Blocked cases come back as an error message.
      const { data, error } = await supabase.functions.invoke("delete-account");
      if (error || data?.error) {
        let msg = data?.error || error?.message || "Account deletion failed.";
        // functions.invoke wraps non-2xx as a generic FunctionsHttpError; the
        // real message is in the response body when available.
        if (error?.context?.json) {
          try { msg = (await error.context.json())?.error || msg; } catch { /* keep msg */ }
        }
        setState((s) => ({ ...s, busy: false, err: msg }));
        return;
      }
      // Cover the whole app before signing out: signing out re-renders the
      // app into the sign-in page, which used to flash before the redirect.
      announceAccountDeleted();
      await signOutWithLocalFallback();
      window.location.href = "/";
    } catch (e2) {
      setState((s) => ({ ...s, busy: false, err: e2?.message || "Account deletion failed. Please try again." }));
    }
  };

  return (
    <DialogShell
      isOpen={isOpen}
      onClose={close}
      title="Delete account"
      tone="danger"
      closeOnOverlay={!dirty && !state.busy}
      closeOnEscape={!dirty && !state.busy}
    >
      <form onSubmit={remove} className="flex flex-col gap-3">
        <p className="text-text/80 text-sm leading-relaxed">
          {isOwner
            ? "This permanently deletes your account AND your organization: all equipment, history, locations and settings. Any active subscription is cancelled automatically. This cannot be undone."
            : "This permanently deletes your account. Your organization's data is not affected. This cannot be undone."}
        </p>
        <label className="text-text/80 text-sm" htmlFor="delete-account-confirm">
          Type <span className="font-mono font-bold text-danger">DELETE</span> to confirm:
        </label>
        <input
          id="delete-account-confirm"
          type="text"
          placeholder="DELETE"
          value={state.confirm}
          onChange={(e) => setState((s) => ({ ...s, confirm: e.target.value, err: "" }))}
          className="w-full px-3 py-2 rounded bg-background text-text border border-danger/30 text-sm placeholder:text-text/30 focus:outline-hidden focus:ring-2 focus:ring-danger/40"
          autoComplete="off"
          data-autofocus
        />
        {state.err && <p className="text-danger text-xs">{state.err}</p>}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={close} disabled={state.busy}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={state.confirm !== "DELETE" || state.busy}
            className={state.confirm !== "DELETE" || state.busy ? "btn-disabled" : "btn-danger"}
          >
            {state.busy ? "Deleting…" : "Permanently delete my account"}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}
