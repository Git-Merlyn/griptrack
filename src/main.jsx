// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import * as Sentry from "@sentry/react";
import UserProvider from "./context/UserProvider";
import { TeamProvider } from "./context/TeamProvider";
import { EquipmentProvider } from "./context/EquipmentContext";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";

// Dev-only: permission testing panel.
// import.meta.env.DEV is replaced with `false` at build time so Vite's
// tree-shaker removes this import and the component entirely from production.
import DevPanel from "./components/DevPanel.jsx";

// Error tracking — no-op until VITE_SENTRY_DSN is set (Vercel env var).
// Captures unhandled errors, unhandled rejections, and everything the
// ErrorBoundary catches (it calls Sentry.captureException).
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    ignoreErrors: [
      // Chunk-load failures right after a deploy are handled by the
      // vite:preloadError reload below — not actionable, don't report them.
      /Failed to fetch dynamically imported module/i,
      // Supabase auth-js coordinates cross-tab token refresh via the Web Locks
      // API; when a page is torn down mid-acquisition (crawlers, fast tab
      // close) the pending lock rejects with this AbortError as an unhandled
      // rejection. It originates in @supabase/auth-js/lib/locks.js, is benign
      // (auth still works), and a real auth problem would surface as other
      // errors we do capture. Filter the noise.
      /signal is aborted without reason/i,
    ],

    // Session Replay — a video-like reconstruction of what the user did.
    integrations: [Sentry.replayIntegration()],
    // Record 100% of sessions that hit an error, but only 10% of ordinary
    // sessions: the free plan includes ~50 replays/month, so recording every
    // session (the wizard's 1.0 default) would exhaust the quota in a day or
    // two of beta traffic. Bump replaysSessionSampleRate if you upgrade plans.
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

// After a deploy, hashed chunk filenames change; tabs opened before the
// deploy fail to lazy-load routes (Staff, Locations, …) and hit the error
// boundary. Vite reports that as vite:preloadError — reload once to pick up
// the new build. The sessionStorage guard prevents a reload loop if the
// chunk is genuinely unreachable (e.g. offline).
window.addEventListener("vite:preloadError", (event) => {
  const KEY = "gt_chunk_reload_at";
  const last = Number(sessionStorage.getItem(KEY) || 0);
  if (Date.now() - last < 30_000) return; // let the error boundary show
  sessionStorage.setItem(KEY, String(Date.now()));
  event.preventDefault();
  window.location.reload();
});

// Provider order matters:
//   UserProvider     — auth, org, role, assigned teamId
//   TeamProvider     — active team selection (reads UserContext)
//   EquipmentProvider — equipment queries scoped by active team (reads both)
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <UserProvider>
          <TeamProvider>
            <EquipmentProvider>
              <App />
              {import.meta.env.DEV && <DevPanel />}
            </EquipmentProvider>
          </TeamProvider>
        </UserProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
);
