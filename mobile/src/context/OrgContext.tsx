/**
 * OrgContext — fetches org-level feature flags from the `organizations` table.
 *
 * Flags live in a JSONB `features` column:
 *   { teams_enabled: boolean, requests_enabled: boolean }
 *
 * Both default to `true` if the column is missing or the value is absent,
 * so existing orgs are unaffected until a flag is explicitly set to false.
 */

import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from './AuthContext';

interface OrgFeatures {
  teamsEnabled: boolean;
  requestsEnabled: boolean;
}

interface OrgContextValue {
  orgId: string | null;
  features: OrgFeatures;
  loadingFeatures: boolean;
  /** Owner-only: persist an updated features object to Supabase and update local state. */
  updateFeatures: (next: OrgFeatures) => Promise<void>;
}

// Off by default — teams/requests are opt-in. Real values load from the org.
const DEFAULT_FEATURES: OrgFeatures = {
  teamsEnabled: false,
  requestsEnabled: false,
};

const OrgContext = createContext<OrgContextValue>({
  orgId: null,
  features: DEFAULT_FEATURES,
  loadingFeatures: false,
  updateFeatures: async () => {},
});

export function useOrgContext() {
  return useContext(OrgContext);
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuthContext();
  const [features, setFeatures] = useState<OrgFeatures>(DEFAULT_FEATURES);
  const [loadingFeatures, setLoadingFeatures] = useState(false);

  // Keep a ref to current features so updateFeatures can roll back without
  // stale closure issues.
  const featuresRef = useRef(features);
  featuresRef.current = features;

  const orgId = profile?.org_id ?? null;

  useEffect(() => {
    if (!orgId) return;

    let cancelled = false;
    setLoadingFeatures(true);

    async function fetchFeatures() {
      const { data, error } = await supabase
        .from('organizations')
        .select('features')
        .eq('id', orgId!)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.warn('[OrgContext] failed to fetch features, using defaults', error.message);
        setFeatures(DEFAULT_FEATURES);
      } else {
        // Parse JSONB — off by default (opt-in). Existing orgs were backfilled
        // with an explicit flag, so absent means a genuinely new/unset org.
        const f = (data?.features as Record<string, unknown>) ?? {};
        setFeatures({
          teamsEnabled:    f.teams_enabled    === true,
          requestsEnabled: f.requests_enabled === true,
        });
      }

      if (!cancelled) setLoadingFeatures(false);
    }

    fetchFeatures();

    return () => { cancelled = true; };
  }, [orgId]);

  async function updateFeatures(next: OrgFeatures) {
    if (!orgId) return;

    const previous = featuresRef.current;

    // Optimistic update — feels instant to the user
    setFeatures(next);

    const { error } = await supabase
      .from('organizations')
      .update({
        features: {
          teams_enabled:    next.teamsEnabled,
          requests_enabled: next.requestsEnabled,
        },
      })
      .eq('id', orgId);

    if (error) {
      // Roll back to previous state on failure
      setFeatures(previous);
      throw new Error(error.message);
    }
  }

  return (
    <OrgContext.Provider value={{ orgId, features, loadingFeatures, updateFeatures }}>
      {children}
    </OrgContext.Provider>
  );
}
