import React, { useEffect, useMemo, useState } from "react";

export default function PasswordGate({ children }) {
  const SITE_PASSWORD = import.meta.env.VITE_BETA_PASSWORD || "";
  const STORAGE_KEY = "griptrack_beta_unlocked_v1";

  const [input, setInput] = useState("");
  const [remember, setRemember] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // auto-unlock if previously remembered
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "true") setUnlocked(true);
  }, []);

  const canUseGate = useMemo(
    () => SITE_PASSWORD.trim().length > 0,
    [SITE_PASSWORD],
  );

  function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!canUseGate) {
      setError("Missing VITE_BETA_PASSWORD env var.");
      return;
    }

    if (input === SITE_PASSWORD) {
      setUnlocked(true);
      if (remember) localStorage.setItem(STORAGE_KEY, "true");
      else localStorage.removeItem(STORAGE_KEY);

      window.toast?.success?.("Access granted.");
    } else {
      setError("Incorrect password.");
      window.toast?.error?.("Incorrect password.");
    }
  }

  if (unlocked) {
    return (
      <div className="min-h-screen bg-slate-950 text-gray-100">{children}</div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-gray-100 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-slate-900/40 p-6 shadow border border-slate-800">
        <h1 className="text-xl font-semibold mb-1 text-center">
          GripTrack Beta
        </h1>
        <p className="text-sm text-gray-300 mb-6 text-center">
          Enter the site password to continue.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-2">Password</label>
            <input
              className="w-full rounded-lg bg-slate-950/60 border border-slate-700 px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-400"
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoFocus
            />
            {error ? (
              <p className="text-xs text-red-300 mt-2">{error}</p>
            ) : null}
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-300 select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="accent-cyan-400"
            />
            Remember this computer
          </label>

          <button
            type="submit"
            className="w-full rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold py-2"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}
