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
  const [orgName, setOrgName] = useState("");
  const [needsOrgSetup, setNeedsOrgSetup] = useState(false);
  const [profile, setProfile] = useState(null);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const [loadingOrg, setLoadingOrg] = useState(true);

  const isPlaceholderOrgName = (name) => {
    const n = String(name || "").trim();
    // Treat empty or obvious placeholders as "needs setup"
    return (
      !n ||
      n.toLowerCase() === "default org" ||
      n.toLowerCase() === "new company" ||
      n.toLowerCase() === "organization" ||
      n.toLowerCase() === "company"
    );
  };

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
    setOrgName("");
    setNeedsOrgSetup(false);
    setProfile(null);
    setNeedsProfileSetup(false);
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

    // Force a clean reload to the login page.
    window.location.href = "/auth";
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
        setOrgName("");
        setNeedsOrgSetup(false);
        setProfile(null);
        setNeedsProfileSetup(false);
        setLoadingOrg(false);
        return;
      }

      setAuthUser(session.user);
      setLoadingOrg(true);

      const { data: inviteData, error: inviteError } = await supabase.rpc(
        "accept_org_invite_for_user",
      );

      if (inviteError) {
        console.warn("accept_org_invite_for_user failed", inviteError);
      } else if (Array.isArray(inviteData) && inviteData.length > 0) {
        console.log("accept_org_invite_for_user matched invite", inviteData[0]);
      }

      const { data, error } = await supabase.rpc("ensure_org_for_user");
      if (cancelled) return;

      if (error) {
        // Fail closed: no org context.
        console.error("ensure_org_for_user failed", error);
        setOrgId(null);
        setRole(null);
        setOrgName("");
        setNeedsOrgSetup(false);
        setProfile(null);
        setNeedsProfileSetup(false);
        setLoadingOrg(false);
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;

      const nextOrgId = row?.org_id ?? null;
      setOrgId(nextOrgId);
      setRole(row?.role ?? null);

      // Fetch org name to determine if setup is required.
      if (nextOrgId) {
        const { data: orgRow, error: orgErr } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", nextOrgId)
          .single();

        if (orgErr) {
          // If we can't read org name, fail open (don't block app in setup loop)
          console.warn("Failed to load organization name", orgErr);
          setOrgName("");
          setNeedsOrgSetup(false);
        } else {
          const name = String(orgRow?.name || "").trim();
          setOrgName(name);
          setNeedsOrgSetup(isPlaceholderOrgName(name));
        }
      } else {
        setOrgName("");
        setProfile(null);
        // No org id means something is wrong; treat as needing setup to be safe.
        setNeedsOrgSetup(true);
      }

      // Load profile for the signed-in user.
      const { data: profileRow, error: profileErr } = await supabase
        .from("profiles")
        .select("id,email,full_name,phone")
        .eq("id", session.user.id)
        .single();

      if (profileErr) {
        // If no profile exists yet, require profile setup.
        console.warn("Failed to load profile", profileErr);
        setProfile(null);
        setNeedsProfileSetup(true);
      } else {
        setProfile(profileRow ?? null);
        setNeedsProfileSetup(!String(profileRow?.full_name || "").trim());
      }

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
      orgName,
      needsOrgSetup,
      profile,
      needsProfileSetup,
      loadingOrg,
    }),
    [
      user,
      authUser,
      orgId,
      role,
      orgName,
      needsOrgSetup,
      profile,
      needsProfileSetup,
      loadingOrg,
    ],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

export default UserProvider;
