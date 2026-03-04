import { useEffect, useMemo, useState } from "react";
import UserContext from "./UserContext";
import { supabase } from "@/lib/supabaseClient";

const STORAGE_KEY = "griptrack_username";

const UserProvider = ({ children }) => {
  // Legacy/local identity (kept for now so existing PasswordGate flows don't implode)
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const username = stored ? String(stored).trim() : "";
      return username ? { username } : null;
    } catch {
      return null;
    }
  });

  // Supabase-auth identity (preferred going forward)
  const [authUser, setAuthUser] = useState(null);

  // Org context
  const [orgId, setOrgId] = useState(null);
  const [role, setRole] = useState(null);
  const [loadingOrg, setLoadingOrg] = useState(true);

  const login = (username) => {
    // NOTE: This is legacy. Real auth should happen via Supabase auth UI/flows.
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

  const logout = async () => {
    setUser(null);
    setAuthUser(null);
    setOrgId(null);
    setRole(null);
    setLoadingOrg(false);

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }

    // If the app is using Supabase auth, sign out there too.
    try {
      await supabase.auth.signOut();
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

  // 5B) Org bootstrap: on any valid Supabase session, ensure the user has an org
  useEffect(() => {
    let unsub = null;
    let cancelled = false;

    const ensureOrg = async (session) => {
      if (cancelled) return;

      if (!session?.user) {
        setAuthUser(null);
        setOrgId(null);
        setRole(null);
        setLoadingOrg(false);
        return;
      }

      setAuthUser(session.user);
      setLoadingOrg(true);

      const { data, error } = await supabase.rpc("ensure_org_for_user");
      if (cancelled) return;

      if (error) {
        // Fail closed: no org context.
        console.error("ensure_org_for_user failed", error);
        setOrgId(null);
        setRole(null);
        setLoadingOrg(false);
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;
      setOrgId(row?.org_id ?? null);
      setRole(row?.role ?? null);
      setLoadingOrg(false);
    };

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      await ensureOrg(data?.session);

      const { data: sub } = supabase.auth.onAuthStateChange((_, session) => {
        ensureOrg(session);
      });
      unsub = sub?.subscription;
    };

    init();

    return () => {
      cancelled = true;
      try {
        unsub?.unsubscribe?.();
      } catch {
        // ignore
      }
    };
  }, []);

  const value = useMemo(
    () => ({
      // legacy user
      user,
      login,
      logout,

      // supabase auth user (preferred)
      authUser,

      // org info
      orgId,
      role,
      loadingOrg,
    }),
    [user, authUser, orgId, role, loadingOrg],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

export default UserProvider;
