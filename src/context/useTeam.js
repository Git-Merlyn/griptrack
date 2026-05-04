import { useContext } from "react";
import TeamContext from "./TeamContext";

export default function useTeam() {
  const context = useContext(TeamContext);
  if (!context) throw new Error("useTeam must be used within TeamProvider");
  return context;
}
