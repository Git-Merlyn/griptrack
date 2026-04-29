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
import { Team, canSwitchTeams } from '../lib/types';
import { useAuthContext } from './AuthContext';

// AsyncStorage key — per org so each org has its own sticky active team (admin/owner only)
const storageKey = (orgId: string) => `gt_active_team_${orgId}`;

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

  const canSwitch = role !== null && canSwitchTeams(role);

  // Hydrate active team:
  // - admin/owner: restore from AsyncStorage (they can switch)
  // - crew/dept_head: always locked to their own team_id
  useEffect(() => {
    if (!orgId || !userTeamId) return;

    if (canSwitch) {
      AsyncStorage.getItem(storageKey(orgId)).then((stored) => {
        setActiveTeamIdState(stored ?? userTeamId);
      });
    } else {
      // Non-admins always see their own team
      setActiveTeamIdState(userTeamId);
    }
  }, [orgId, userTeamId, canSwitch]);

  const setActiveTeamId = useCallback(
    (id: string) => {
      if (!canSwitch) return; // guard: only admins/owners can switch
      setActiveTeamIdState(id);
      if (orgId) AsyncStorage.setItem(storageKey(orgId), id);
    },
    [canSwitch, orgId]
  );

  const loadTeams = useCallback(async () => {
    if (!orgId) return;
    setLoadingTeams(true);
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('id, org_id, name, max_seats')
        .eq('org_id', orgId)
        .order('name', { ascending: true });

      if (error) throw error;

      const list = (data ?? []) as Team[];
      setTeams(list);

      if (canSwitch) {
        setActiveTeamIdState((current) => {
          // If the stored team no longer exists, fall back
          if (current && !list.some((t) => t.id === current)) {
            const fallback = (userTeamId && list.some((t) => t.id === userTeamId))
              ? userTeamId
              : (list[0]?.id ?? null);
            if (orgId && fallback) AsyncStorage.setItem(storageKey(orgId), fallback);
            return fallback;
          }
          // No team selected yet (e.g. owner with no stored pref, or teams feature disabled)
          // Auto-select: user's own team if valid, otherwise the first team.
          if (!current && list.length > 0) {
            const defaultId = (userTeamId && list.some((t) => t.id === userTeamId))
              ? userTeamId
              : list[0].id;
            if (orgId) AsyncStorage.setItem(storageKey(orgId), defaultId);
            return defaultId;
          }
          return current;
        });
      }
    } catch (err) {
      console.error('Failed to load teams', err);
      setTeams([]);
    } finally {
      setLoadingTeams(false);
    }
  }, [orgId, canSwitch, userTeamId]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

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
