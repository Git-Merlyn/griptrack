// src/pages/SettingsPage.jsx
// Org-level settings — visible to all authenticated users but editable by
// owners only. Currently exposes optional feature flags for Teams and
// Equipment Requests.

import { useState } from "react";
import { Navigate } from "react-router-dom";
import useUser from "@/context/useUser";

// ── FeatureToggle ─────────────────────────────────────────────────────────────
function FeatureToggle({ label, description, enabled, onChange, disabled }) {
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="flex-1 min-w-0">
        <p className="text-text font-medium text-sm">{label}</p>
        <p className="text-text/50 text-xs mt-0.5">{description}</p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={disabled}
        onClick={() => onChange(!enabled)}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent/40 ${
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
        } ${enabled ? "bg-accent/80" : "bg-text/20"}`}
      >
        <span
          className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${
            enabled ? "left-6" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}

// ── SettingsPage ──────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { role, features, updateFeature } = useUser();
  const isOwner = role === "owner";

  const [saving, setSaving] = useState(null); // key of the feature being saved
  const [errors, setErrors] = useState({});

  const handleToggle = async (key, value) => {
    setSaving(key);
    setErrors((e) => ({ ...e, [key]: null }));
    const { error } = await updateFeature(key, value);
    if (error) setErrors((e) => ({ ...e, [key]: "Failed to save — try again." }));
    setSaving(null);
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-6 flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-accent">Settings</h1>
        <p className="text-sm text-text/60 mt-0.5">
          Manage features and preferences for your organization.
        </p>
      </div>

      {/* Features section */}
      <section className="bg-surface border border-text/10 rounded-xl px-5 divide-y divide-text/10">
        <div className="py-4">
          <h2 className="text-sm font-semibold text-text">Optional Features</h2>
          <p className="text-xs text-text/50 mt-0.5">
            Turn features on or off for your whole organization. Existing data
            is never deleted — disabling just hides the feature until it's
            turned back on.
          </p>
          {!isOwner && (
            <p className="text-xs text-warning/80 mt-2">
              Only the account owner can change these settings.
            </p>
          )}
        </div>

        <FeatureToggle
          label="Teams"
          description="Separate your inventory by department (e.g. Grip, Electric). Useful for indie productions where one person manages multiple departments."
          enabled={features.teams_enabled}
          disabled={!isOwner || saving === "teams_enabled"}
          onChange={(v) => handleToggle("teams_enabled", v)}
        />
        {errors.teams_enabled && (
          <p className="text-danger text-xs pb-3">{errors.teams_enabled}</p>
        )}

        <FeatureToggle
          label="Equipment Requests"
          description="Allow crew members to submit gear requests that you can approve or decline."
          enabled={features.requests_enabled}
          disabled={!isOwner || saving === "requests_enabled"}
          onChange={(v) => handleToggle("requests_enabled", v)}
        />
        {errors.requests_enabled && (
          <p className="text-danger text-xs pb-3">{errors.requests_enabled}</p>
        )}
      </section>
    </div>
  );
}
