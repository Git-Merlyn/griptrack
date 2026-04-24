import { useContext } from "react";
import TeamContext from "./TeamContext";

export default function useTeam() {
  return useContext(TeamContext);
}
