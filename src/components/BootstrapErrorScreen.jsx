// src/components/BootstrapErrorScreen.jsx
// Shown when the user is signed in but bootstrap_session failed (audit L3),
// instead of rendering the app with no organization.
import { useState } from "react";

export default function BootstrapErrorScreen({ error, onRetry, onSignOut }) {
  const [busy, setBusy] = useState(false);

  const retry = async () => {
    setBusy(true);
    try {
      await onRetry?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div role="alert" className="bg-surface rounded-2xl p-6 w-full max-w-md shadow-lg">
        <h1 className="text-xl font-bold text-heading mb-2">
          We couldn’t load your organization
        </h1>
        <p className="text-gray-300 text-sm mb-4">
          Check your connection and try again. If this keeps happening, sign out
          and sign back in.
        </p>
        {error?.message ? (
          <p className="text-xs text-gray-500 mb-4 break-words">
            Details: {error.message}
          </p>
        ) : null}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={retry}
            disabled={busy}
            className={busy ? "btn-disabled" : "btn-accent"}
          >
            {busy ? "Retrying…" : "Try again"}
          </button>
          <button type="button" onClick={onSignOut} className="btn-secondary">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
