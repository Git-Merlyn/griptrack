/**
 * OrgContext — org-level feature flags ({ teamsEnabled, requestsEnabled }).
 *
 * The flags arrive from bootstrap_session in the same state update as the
 * profile (useAuth), and are cached with it for offline launches. So there is
 * no separate fetch and no "defaults until loaded" window (M26): while a
 * profile exists the flags are the org's real flags. SIGNED_OUT_FEATURES is
 * only seen when there is no profile, and every consumer already bails on
 * !profile (RootNavigator does not mount the app without one).
 *
 * Flags are opt-in: anything but literal true is off (lib/authCache.ts).
 */

import React, { createContext, useCallback, useContext, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { OrgFeatures } from '../lib/authCache';
import { useAuthContext } from './AuthContext';

export type { OrgFeatures };

interface OrgContextValue {
  orgId: string | null;
  /** The org's flags. Both off only when signed out (profile is null). */
  features: OrgFeatures;
  /** Owner-only: persist an updated features object to Supabase and update local state. */
  updateFeatures: (next: OrgFeatures) => Promise<void>;
}

const SIGNED_OUT_FEATURES: OrgFeatures = {
  teamsEnabled: false,
  requestsEnabled: false,
};

const OrgContext = createContext<OrgContextValue>({
  orgId: null,
  features: SIGNED_OUT_FEATURES,
  updateFeatures: async () => {},
});

export function useOrgContext() {
  return useContext(OrgContext);
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { profile, features: authFeatures, setFeatures } = useAuthContext();
  const orgId = profile?.org_id ?? null;
  const features = authFeatures ?? SIGNED_OUT_FEATURES;

  const updateFeatures = useCallback(
    async (next: OrgFeatures) => {
      if (!orgId || !authFeatures) return;
      const previous = authFeatures;

      // Optimistic update — feels instant to the user (also updates the cache)
      setFeatures(next);

      // .select('id'): RLS turns a forbidden UPDATE (non-owner, read-only
      // ghost) into 0 rows with no error, so count the rows (M19/L2 pattern,
      // handed over by WP02).
      const { data, error } = await supabase
        .from('organizations')
        .update({
          features: {
            teams_enabled: next.teamsEnabled,
            requests_enabled: next.requestsEnabled,
          },
        })
        .eq('id', orgId)
        .select('id');

      if (error || !data || data.length === 0) {
        // Roll back to previous state on failure
        setFeatures(previous);
        throw new Error(
          error?.message ?? "Not saved: you don't have permission to change this organization's settings."
        );
      }
    },
    [orgId, authFeatures, setFeatures]
  );

  return (
    <OrgContext.Provider value={{ orgId, features, updateFeatures }}>
      {children}
    </OrgContext.Provider>
  );
}
