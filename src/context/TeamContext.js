import { createContext } from "react";

const TeamContext = createContext({
  teams: [],
  activeTeamId: null,
  activeTeam: null,
  loadingTeams: true,

  setActiveTeamId: () => {},
  createTeam: async () => {},
  archiveTeam: async () => {},
  deleteTeam: async () => {},
  refreshTeams: async () => {},
});

export default TeamContext;
