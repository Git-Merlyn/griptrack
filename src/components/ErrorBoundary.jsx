// src/components/ErrorBoundary.jsx
// Catches unhandled React render errors and shows a friendly fallback
// instead of a blank screen. Directs users to the in-app feedback button
// via a custom DOM event so we don't need to wire prop/context into a
// class component.

import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log to console so it's visible in dev tools
    console.error("[ErrorBoundary] Uncaught error:", error, info);
  }

  handleOpenFeedback = () => {
    // Signal the Sidebar to open the feedback modal.
    // The Sidebar listens for this event with a useEffect.
    window.dispatchEvent(new CustomEvent("griptrack:open-feedback"));
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="bg-surface border border-text/10 rounded-2xl p-8 max-w-md w-full shadow-lg flex flex-col gap-5">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-accent mb-1">
              Something went wrong
            </h1>
            <p className="text-text/70 text-sm">
              GripTrack hit an unexpected error. Your data is safe — this is
              likely a display issue that a refresh will fix.
            </p>
          </div>

          {/* Error detail (collapsible, dev-friendly) */}
          {this.state.error?.message && (
            <details className="bg-background rounded-lg px-4 py-3 text-xs text-text/50 cursor-pointer">
              <summary className="font-medium text-text/60 select-none">
                Error details
              </summary>
              <p className="mt-2 font-mono break-all">{this.state.error.message}</p>
            </details>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="btn-accent w-full"
            >
              Refresh page
            </button>
            <button
              type="button"
              onClick={this.handleOpenFeedback}
              className="btn-secondary w-full"
            >
              Report this issue
            </button>
          </div>

          <p className="text-xs text-text/40 text-center">
            Tapping "Report this issue" opens the beta feedback form — let us
            know what you were doing when this happened.
          </p>
        </div>
      </div>
    );
  }
}
