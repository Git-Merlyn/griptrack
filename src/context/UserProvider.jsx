import { useEffect, useMemo, useState } from "react";
import UserContext from "./UserContext";

const STORAGE_KEY = "griptrack_username";

const UserProvider = ({ children }) => {
  // Load initial user from localStorage (session identity, not secure auth)
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const username = stored ? String(stored).trim() : "";
      return username ? { username } : null;
    } catch {
      return null;
    }
  });

  const login = (username) => {
    const name = String(username ?? "").trim();
    if (!name) {
      setUser(null);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      return;
    }

    setUser({ username: name });
    try {
      localStorage.setItem(STORAGE_KEY, name);
    } catch {
      // ignore
    }
  };

  const logout = () => {
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  // Keep localStorage in sync if user is ever set directly in the future
  useEffect(() => {
    try {
      if (user?.username) {
        localStorage.setItem(STORAGE_KEY, String(user.username));
      }
    } catch {
      // ignore
    }
  }, [user]);

  const value = useMemo(() => ({ user, login, logout }), [user]);

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

export default UserProvider;
