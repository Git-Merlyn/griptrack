import { createContext } from "react";

const UserContext = createContext({
  user: null,
  login: () => {},
  logout: () => {},
});

export default UserContext;
