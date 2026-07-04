// src/components/ErrorBoundary.jsx
// Catches unhandled React render errors and shows a friendly fallback
// instead of a blank screen.
//
// The Sidebar is unmounted when the fallback is showing, so the old custom
// event approach didn't work. FeedbackModal is rendered directly here instead.

import { Component } from "react";
import * as Sentry from "@sentry/react";
import FeedbackModal from "./feedback/FeedbackModal";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, feedbackOpen: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] Uncaught error:", error, info);
    // No-op unless Sentry.init ran (VITE_SENTRY_DSN set in main.jsx)
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info?.componentStack } },
    });
  }

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

          {/* Error detail (collapsible) */}
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
              onClick={() => this.setState({ feedbackOpen: true })}
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

        {/* FeedbackModal rendered directly — the Sidebar is unmounted when
            the error boundary fallback is showing, so we can't rely on the
            custom event bridge that normally opens it. */}
        <FeedbackModal
          isOpen={this.state.feedbackOpen}
          onClose={() => this.setState({ feedbackOpen: false })}
        />
      </div>
    );
  }
}
