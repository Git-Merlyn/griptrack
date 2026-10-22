import { createContext } from "react";

const TeamContext = createContext({
  teams: [],
  activeTeamId: null,
  activeTeam: null,
  loadingTeams: true,
  // canSwitchTeams: role may browse every team (owner/admin).
  // canChooseTeam: may pick the active team now = canSwitchTeams, or any role
  // while a dev role override is active (DevPanel testing).
  canSwitchTeams: false,
  canChooseTeam: false,

  setActiveTeamId: () => {},
  createTeam: async () => {},
  archiveTeam: async () => {},
  deleteTeam: async () => {},
  refreshTeams: async () => {},
});

export default TeamContext;
