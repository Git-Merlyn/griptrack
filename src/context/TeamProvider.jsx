import { useState, useEffect, useCallback, useContext, useMemo, useRef } from "react";
import TeamContext from "./TeamContext";
import UserContext from "./UserContext";
import { supabase } from "../lib/supabaseClient";

const lsKey = (orgId) => `gt_active_team_${orgId}`;

export const TeamProvider = ({ children }) => {
  const { orgId, teamId: assignedTeamId, canSwitchTeams, devRoleOverride } = useContext(UserContext) || {};

  const [teams, setTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [activeTeamId, setActiveTeamIdState] = useState(null);

  // Current activeTeamId for callbacks that intentionally aren't re-created
  // when it changes (loadTeams) — avoids acting on a stale value.
  const activeTeamIdRef = useRef(null);
  useEffect(() => {
    activeTeamIdRef.current = activeTeamId;
  }, [activeTeamId]);

  // Hydrate active team from localStorage once orgId is known.
  // Coordinators (admin/owner) remember their last-used team across sessions.
  // Crew and department heads are always locked to their assigned team.
  // Exception: in dev mode with a role override active, always use localStorage
  // so the tester account (which has no assigned team) can still see inventory.
  useEffect(() => {
    if (!orgId) return;
    const isDevOverride = import.meta.env.DEV && !!devRoleOverride;
    if (!canSwitchTeams && !isDevOverride) {
      // Lock non-admin users to their assigned team — ignore any stored preference
      setActiveTeamIdState(assignedTeamId ?? null);
      return;
    }
    const stored = localStorage.getItem(lsKey(orgId));
    setActiveTeamIdState(stored || null);
  }, [orgId, canSwitchTeams, assignedTeamId, devRoleOverride]);

  const setActiveTeamId = useCallback(
    (id) => {
      // Crew/dept_head cannot switch teams — silently ignore
      if (!canSwitchTeams) return;
      setActiveTeamIdState(id);
      if (orgId) {
        if (id) {
          localStorage.setItem(lsKey(orgId), id);
        } else {
          localStorage.removeItem(lsKey(orgId));
        }
      }
    },
    [canSwitchTeams, orgId],
  );

  const loadTeams = useCallback(async () => {
    if (!orgId) return;
    setLoadingTeams(true);
    try {
      const { data, error } = await supabase
        .from("teams")
        .select("id, name, status, max_seats, created_at")
        .eq("org_id", orgId)
        .order("name", { ascending: true });

      if (error) throw error;
      setTeams(data ?? []);

      // If stored team no longer exists, clear it. Read the CURRENT id from
      // the ref — this callback is deliberately not re-created on team
      // switches, so the closed-over state value could be stale.
      const currentTeamId = activeTeamIdRef.current;
      if (currentTeamId) {
        const stillExists = (data ?? []).some((t) => t.id === currentTeamId);
        if (!stillExists) setActiveTeamId(null);
      }
    } catch (err) {
      console.error("Failed to load teams", err);
      setTeams([]);
    } finally {
      setLoadingTeams(false);
    }
  }, [orgId, setActiveTeamId]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  const createTeam = useCallback(
    async ({ name, maxSeats = 10 }) => {
      if (!orgId) throw new Error("No organization found");
      const trimmed = String(name || "").trim();
      if (!trimmed) throw new Error("Team name is required");

      const { data, error } = await supabase
        .from("teams")
        .insert({ org_id: orgId, name: trimmed, max_seats: maxSeats })
        .select("id, name, status, max_seats, created_at")
        .single();

      if (error) throw error;
      setTeams((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      return data;
    },
    [orgId],
  );

  const archiveTeam = useCallback(
    async (teamId) => {
      const { data, error } = await supabase
        .from("teams")
        .update({ status: "archived" })
        .eq("id", teamId)
        .select("id, name, status, max_seats, created_at")
        .single();

      if (error) throw error;
      setTeams((prev) => prev.map((t) => (t.id === teamId ? data : t)));
      if (activeTeamIdRef.current === teamId) setActiveTeamId(null);
    },
    [setActiveTeamId],
  );

  const deleteTeam = useCallback(
    async (teamId) => {
      const { error } = await supabase.from("teams").delete().eq("id", teamId);
      if (error) throw error;
      setTeams((prev) => prev.filter((t) => t.id !== teamId));
      if (activeTeamIdRef.current === teamId) setActiveTeamId(null);
    },
    [setActiveTeamId],
  );

  const activeTeam = teams.find((t) => t.id === activeTeamId) ?? null;

  // Memoized: a fresh value object every render would re-render every
  // consumer (Sidebar, Dashboard, EquipmentProvider…) on any parent update.
  const value = useMemo(
    () => ({
      teams,
      activeTeamId,
      activeTeam,
      loadingTeams,
      canSwitchTeams,
      setActiveTeamId,
      createTeam,
      archiveTeam,
      deleteTeam,
      refreshTeams: loadTeams,
    }),
    [
      teams,
      activeTeamId,
      activeTeam,
      loadingTeams,
      canSwitchTeams,
      setActiveTeamId,
      createTeam,
      archiveTeam,
      deleteTeam,
      loadTeams,
    ],
  );

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
};

export default TeamProvider;
