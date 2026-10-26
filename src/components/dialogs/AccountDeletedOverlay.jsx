import React, { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { ACCOUNT_DELETED_EVENT as EVENT } from "./accountDeletedEvent";

/**
 * Mounted once at the app root, above the signed-in/signed-out switch, so it
 * keeps covering the page while sign-out re-renders the app and the browser
 * loads the home page. Nothing else can show through in between.
 */
export default function AccountDeletedOverlay() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    // flushSync: paint the overlay before the caller signs out, so the
    // sign-out re-render can never show the sign-in page first.
    const on = () => flushSync(() => setShown(true));
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  if (!shown) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-2 bg-background text-center px-6"
    >
      <p className="text-heading text-lg font-semibold">Your account has been deleted.</p>
      <p className="text-text/70 text-sm">Taking you to the home page…</p>
    </div>
  );
}
