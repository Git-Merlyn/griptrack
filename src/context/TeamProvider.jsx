import { useState, useEffect, useCallback, useContext } from "react";
import TeamContext from "./TeamContext";
import UserContext from "./UserContext";
import { supabase } from "../lib/supabaseClient";

const lsKey = (orgId) => `gt_active_team_${orgId}`;

export const TeamProvider = ({ children }) => {
  const { orgId, teamId: assignedTeamId, canSwitchTeams } = useContext(UserContext) || {};

  const [teams, setTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [activeTeamId, setActiveTeamIdState] = useState(null);

  // Hydrate active team from localStorage once orgId is known.
  // Coordinators (admin/owner) remember their last-used team across sessions.
  // Crew and department heads are always locked to their assigned team.
  useEffect(() => {
    if (!orgId) return;
    if (!canSwitchTeams) {
      // Lock non-admin users to their assigned team — ignore any stored preference
      setActiveTeamIdState(assignedTeamId ?? null);
      return;
    }
    const stored = localStorage.getItem(lsKey(orgId));
    setActiveTeamIdState(stored || null);
  }, [orgId, canSwitchTeams, assignedTeamId]);

  const setActiveTeamId = (id) => {
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
  };

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

      // If stored team no longer exists, clear it
      if (activeTeamId) {
        const stillExists = (data ?? []).some((t) => t.id === activeTeamId);
        if (!stillExists) setActiveTeamId(null);
      }
    } catch (err) {
      console.error("Failed to load teams", err);
      setTeams([]);
    } finally {
      setLoadingTeams(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  const createTeam = async ({ name, maxSeats = 10 }) => {
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
  };

  const archiveTeam = async (teamId) => {
    const { data, error } = await supabase
      .from("teams")
      .update({ status: "archived" })
      .eq("id", teamId)
      .select("id, name, status, max_seats, created_at")
      .single();

    if (error) throw error;
    setTeams((prev) => prev.map((t) => (t.id === teamId ? data : t)));
    if (activeTeamId === teamId) setActiveTeamId(null);
  };

  const deleteTeam = async (teamId) => {
    const { error } = await supabase.from("teams").delete().eq("id", teamId);
    if (error) throw error;
    setTeams((prev) => prev.filter((t) => t.id !== teamId));
    if (activeTeamId === teamId) setActiveTeamId(null);
  };

  const activeTeam = teams.find((t) => t.id === activeTeamId) ?? null;

  return (
    <TeamContext.Provider
      value={{
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
      }}
    >
      {children}
    </TeamContext.Provider>
  );
};

export default TeamProvider;
