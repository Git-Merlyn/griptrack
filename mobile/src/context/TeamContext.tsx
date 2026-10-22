import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { readCachedTeams, writeCachedTeams } from '../lib/authCache';
import { Team, canSwitchTeams } from '../lib/types';
import { useAuthContext } from './AuthContext';

// AsyncStorage key — per org so each org has its own sticky active team (admin/owner only)
const storageKey = (orgId: string) => `gt_active_team_${orgId}`;

function persistActiveTeam(orgId: string, teamId: string) {
  AsyncStorage.setItem(storageKey(orgId), teamId).catch((e) =>
    console.warn('[TeamContext] could not save active team', e)
  );
}

interface TeamContextValue {
  teams: Team[];
  activeTeamId: string | null;
  activeTeam: Team | null;
  loadingTeams: boolean;
  // Only meaningful for admin/owner — crew/dept_head are always on their own team
  canSwitch: boolean;
  setActiveTeamId: (id: string) => void;
  refreshTeams: () => Promise<void>;
}

const TeamContext = createContext<TeamContextValue | null>(null);

export function TeamProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuthContext();
  const orgId = profile?.org_id ?? null;
  const userTeamId = profile?.team_id ?? null;
  const role = profile?.role ?? null;

  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [activeTeamId, setActiveTeamIdState] = useState<string | null>(null);
  // True once the active team has been restored for this org/role. loadTeams
  // waits for it so its auto-select cannot overwrite the stored pick (L34).
  const [hydrated, setHydrated] = useState(false);

  const canSwitch = role !== null && canSwitchTeams(role);

  // Hydrate active team:
  // - admin/owner: restore from AsyncStorage (they can switch). Owners and
  //   admins often have no team of their own (team_id null), so this must not
  //   depend on userTeamId (L34).
  // - crew/dept_head: always locked to their own team_id
  useEffect(() => {
    if (!orgId) {
      // Signed out: forget the previous user's teams.
      setTeams([]);
      setActiveTeamIdState(null);
      setHydrated(false);
      return;
    }

    if (!canSwitch) {
      // Non-admins always see their own team
      setActiveTeamIdState(userTeamId);
      setHydrated(true);
      return;
    }

    let cancelled = false;
    setHydrated(false);
    AsyncStorage.getItem(storageKey(orgId))
      .then((stored) => {
        if (!cancelled) setActiveTeamIdState(stored ?? userTeamId);
      })
      .catch((e) => {
        console.warn('[TeamContext] could not read active team', e);
        if (!cancelled) setActiveTeamIdState(userTeamId);
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, userTeamId, canSwitch]);

  const setActiveTeamId = useCallback(
    (id: string) => {
      if (!canSwitch) return; // guard: only admins/owners can switch
      setActiveTeamIdState(id);
      if (orgId) persistActiveTeam(orgId, id);
    },
    [canSwitch, orgId]
  );

  const loadTeams = useCallback(async () => {
    if (!orgId) return;
    setLoadingTeams(true);
    // Show the last list we saw at once. Offline with an expired token the
    // fetch below can take ~30 s to fail (auth-js retries the refresh) (H7).
    const cachedFirst = readCachedTeams(orgId);
    if (cachedFirst) setTeams((cur) => (cur.length > 0 ? cur : cachedFirst));
    let list: Team[];
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('id, org_id, name, max_seats')
        .eq('org_id', orgId)
        .order('name', { ascending: true });

      if (error) throw error;
      list = (data ?? []) as Team[];
      writeCachedTeams(orgId, list);
    } catch (err) {
      // Offline or transient: use the last list we saw for this org (H7).
      const cached = readCachedTeams(orgId);
      console.warn('[TeamContext] failed to load teams; using cached list:', !!cached, err);
      if (!cached) {
        setTeams([]);
        setLoadingTeams(false);
        return;
      }
      list = cached;
    }

    setTeams(list);

    if (canSwitch) {
      setActiveTeamIdState((current) => {
        // If the stored team no longer exists, fall back
        if (current && !list.some((t) => t.id === current)) {
          const fallback = (userTeamId && list.some((t) => t.id === userTeamId))
            ? userTeamId
            : (list[0]?.id ?? null);
          if (fallback) persistActiveTeam(orgId, fallback);
          return fallback;
        }
        // No team selected yet (e.g. owner with no stored pref, or teams feature disabled)
        // Auto-select: user's own team if valid, otherwise the first team.
        if (!current && list.length > 0) {
          const defaultId = (userTeamId && list.some((t) => t.id === userTeamId))
            ? userTeamId
            : list[0].id;
          persistActiveTeam(orgId, defaultId);
          return defaultId;
        }
        return current;
      });
    }
    setLoadingTeams(false);
  }, [orgId, canSwitch, userTeamId]);

  useEffect(() => {
    if (hydrated) loadTeams();
  }, [hydrated, loadTeams]);

  const activeTeam = teams.find((t) => t.id === activeTeamId) ?? null;

  return (
    <TeamContext.Provider
      value={{
        teams,
        activeTeamId,
        activeTeam,
        loadingTeams,
        canSwitch,
        setActiveTeamId,
        refreshTeams: loadTeams,
      }}
    >
      {children}
    </TeamContext.Provider>
  );
}

export function useTeamContext(): TeamContextValue {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error('useTeamContext must be used within <TeamProvider>');
  return ctx;
}
