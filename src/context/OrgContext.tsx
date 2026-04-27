/**
 * OrgContext — fetches org-level feature flags from the `organizations` table.
 *
 * Flags live in a JSONB `features` column:
 *   { teams_enabled: boolean, requests_enabled: boolean }
 *
 * Both default to `true` if the column is missing or the value is absent,
 * so existing orgs are unaffected until a flag is explicitly set to false.
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from './AuthContext';

interface OrgFeatures {
  teamsEnabled: boolean;
  requestsEnabled: boolean;
}

interface OrgContextValue {
  features: OrgFeatures;
  loadingFeatures: boolean;
}

const DEFAULT_FEATURES: OrgFeatures = {
  teamsEnabled: true,
  requestsEnabled: true,
};

const OrgContext = createContext<OrgContextValue>({
  features: DEFAULT_FEATURES,
  loadingFeatures: false,
});

export function useOrgContext() {
  return useContext(OrgContext);
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuthContext();
  const [features, setFeatures] = useState<OrgFeatures>(DEFAULT_FEATURES);
  const [loadingFeatures, setLoadingFeatures] = useState(false);

  useEffect(() => {
    if (!profile?.org_id) return;

    let cancelled = false;
    setLoadingFeatures(true);

    supabase
      .from('organizations')
      .select('features')
      .eq('id', profile.org_id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('[OrgContext] failed to fetch features, using defaults', error.message);
          setFeatures(DEFAULT_FEATURES);
          return;
        }

        // Parse JSONB — default both flags to true if absent
        const f = (data?.features as Record<string, unknown>) ?? {};
        setFeatures({
          teamsEnabled:  f.teams_enabled   !== false,
          requestsEnabled: f.requests_enabled !== false,
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingFeatures(false);
      });

    return () => { cancelled = true; };
  }, [profile?.org_id]);

  return (
    <OrgContext.Provider value={{ features, loadingFeatures }}>
      {children}
    </OrgContext.Provider>
  );
}
