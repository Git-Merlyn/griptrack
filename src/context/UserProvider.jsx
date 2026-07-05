import { useEffect, useMemo, useRef, useState } from "react";
import UserContext from "./UserContext";
import { supabase } from "@/lib/supabaseClient";
import { canSwitchTeams as roleCanSwitchTeams, isOrgAdmin } from "@shared/roles";

const UserProvider = ({ children }) => {
  // Supabase auth identity
  const [authUser, setAuthUser] = useState(null);

  // Org context
  const [orgId, setOrgId] = useState(null);
  const [role, setRole] = useState(null);
  const [orgName, setOrgName] = useState("");
  const [needsOrgSetup, setNeedsOrgSetup] = useState(false);
  const [profile, setProfile] = useState(null);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const [loadingOrg, setLoadingOrg] = useState(true);

  // Team assignment (from organization_members.team_id)
  const [teamId, setTeamId] = useState(null);

  // Dev-only role override — lets the DevPanel simulate any permission level.
  // The setter is a no-op in production so this never affects real users.
  const [devRoleOverride, setDevRoleOverrideState] = useState(null);
  const setDevRoleOverride = import.meta.env.DEV
    ? (r) => setDevRoleOverrideState(r || null)
    : () => {};

  // Subscription context
  const [subscription, setSubscription] = useState(null);
  const [loadingSubscription, setLoadingSubscription] = useState(false);

  // Trial
  const [trialEndsAt, setTrialEndsAt] = useState(null);

  // Org feature flags
  const [features, setFeatures] = useState({ teams_enabled: true, requests_enabled: true });

  // User id whose org/profile bootstrap has fully completed. Lets the auth
  // listener ignore repeat events for the same user (see below).
  const bootstrappedUserIdRef = useRef(null);

  const isPlaceholderOrgName = (name) => {
    const n = String(name || "").trim().toLowerCase();
    return !n || ["default org", "new company", "organization", "company"].includes(n);
  };

  const logout = async () => {
    setAuthUser(null);
    setOrgId(null);
    setRole(null);
    setOrgName("");
    setNeedsOrgSetup(false);
    setProfile(null);
    setNeedsProfileSetup(false);
    setLoadingOrg(false);
    setTeamId(null);
    setSubscription(null);
    setTrialEndsAt(null);

    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }

    window.location.href = "/auth";
  };

  const loadSubscription = async (currentOrgId) => {
    if (!currentOrgId) return;

    setLoadingSubscription(true);
    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("plan, status, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id")
        .eq("org_id", currentOrgId)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = no rows found — that's fine, org is on free plan
        console.warn("Failed to load subscription", error);
      }

      setSubscription(data ?? null);
    } catch (e) {
      console.warn("Subscription load error", e);
    } finally {
      setLoadingSubscription(false);
    }
  };

  useEffect(() => {
    let unsub = null;
    let cancelled = false;

    const ensureOrg = async (session) => {
      if (cancelled) return;

      if (!session?.user) {
        bootstrappedUserIdRef.current = null;
        setAuthUser(null);
        setOrgId(null);
        setRole(null);
        setOrgName("");
        setNeedsOrgSetup(false);
        setProfile(null);
        setNeedsProfileSetup(false);
        setLoadingOrg(false);
        setTeamId(null);
        setSubscription(null);
        setTrialEndsAt(null);
        return;
      }

      setAuthUser(session.user);
      setLoadingOrg(true);

      // Single round trip: invite acceptance + org ensure + org row +
      // subscription + team assignment + profile, all from one RPC.
      // (Previously six serial requests — the bulk of the loading screen.)
      const { data: boot, error } = await supabase.rpc("bootstrap_session");
      if (cancelled) return;

      if (error || !boot) {
        console.error("bootstrap_session failed", error);
        setOrgId(null);
        setRole(null);
        setOrgName("");
        setNeedsOrgSetup(false);
        setProfile(null);
        setNeedsProfileSetup(false);
        setLoadingOrg(false);
        setTeamId(null);
        return;
      }

      const nextOrgId = boot.org_id ?? null;
      setOrgId(nextOrgId);
      setRole(boot.role ?? null);

      if (nextOrgId && boot.org) {
        const name = String(boot.org.name || "").trim();
        setOrgName(name);
        setNeedsOrgSetup(isPlaceholderOrgName(name));
        setTrialEndsAt(boot.org.trial_ends_at ?? null);
        // Fall back to enabled if the flag is absent
        setFeatures({
          teams_enabled:    boot.org.features?.teams_enabled    ?? true,
          requests_enabled: boot.org.features?.requests_enabled ?? true,
        });
      } else {
        setOrgName("");
        setNeedsOrgSetup(true);
      }

      setSubscription(boot.subscription ?? null);
      setTeamId(boot.team_id ?? null);

      const profileRow = boot.profile ?? null;
      setProfile(profileRow);
      setNeedsProfileSetup(!String(profileRow?.full_name || "").trim());

      // Bootstrap finished for this user — later auth events for the same
      // user (token refresh, tab refocus) don't need to repeat it.
      bootstrappedUserIdRef.current = session.user.id;
      setLoadingOrg(false);
    };

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      await ensureOrg(data?.session);

      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        // USER_UPDATED fires when updateUser() is called (e.g. password reset).
        // PASSWORD_RECOVERY fires when a reset link is opened.
        // Neither requires a full org/profile re-check — skipping prevents
        // the in-flight requests from being aborted by the subsequent navigation,
        // which would incorrectly flip needsProfileSetup to true.
        // USER_UPDATED fires after updateUser() (e.g. password reset complete).
        // Re-running ensureOrg here causes in-flight requests to be aborted by
        // the subsequent navigation, which flips needsProfileSetup incorrectly.
        if (event === "USER_UPDATED") return;

        // SIGNED_IN re-fires on tab refocus and TOKEN_REFRESHED fires roughly
        // hourly — both for the user we already bootstrapped. Re-running
        // ensureOrg would flip loadingOrg and unmount the whole app to the
        // loading screen, wiping page state. Just keep the auth user fresh.
        if (session?.user?.id && session.user.id === bootstrappedUserIdRef.current) {
          setAuthUser(session.user);
          return;
        }

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

  // Role helpers — derived from role string.
  // In dev mode, devRoleOverride takes precedence so the DevPanel can simulate any role.
  const effectiveRole = (import.meta.env.DEV && devRoleOverride) ? devRoleOverride : role;
  const isDepartmentHead = effectiveRole === "department_head";
  const isCoordinator = !!effectiveRole && isOrgAdmin(effectiveRole);
  // admin/owner can browse any team; crew/dept_head are locked to their assigned team
  const canSwitchTeams = !!effectiveRole && roleCanSwitchTeams(effectiveRole);

  // Toggle an org-level feature flag. Owner-only in the UI, but no server-side
  // enforcement here — RLS on the organizations table handles that.
  const updateFeature = async (key, enabled) => {
    const newFeatures = { ...features, [key]: enabled };
    const { error } = await supabase
      .from("organizations")
      .update({ features: newFeatures })
      .eq("id", orgId);
    if (!error) setFeatures(newFeatures);
    return { error };
  };

  // Derive the active plan — treat any non-active subscription as free
  const plan = useMemo(() => {
    if (!subscription) return "free";
    if (subscription.status === "active" || subscription.status === "trialing") {
      return subscription.plan ?? "free";
    }
    return "free";
  }, [subscription]);

  const value = useMemo(
    () => ({
      authUser,
      logout,
      orgId,
      role: effectiveRole,   // components always see the effective role (real or dev override)
      orgName,
      needsOrgSetup,
      profile,
      needsProfileSetup,
      loadingOrg,
      // Team
      teamId,
      isDepartmentHead,
      isCoordinator,
      canSwitchTeams,
      // Subscription
      subscription,
      plan,
      loadingSubscription,
      trialEndsAt,
      refreshSubscription: () => loadSubscription(orgId),
      // Features
      features,
      updateFeature,
      // Dev only
      devRoleOverride,
      setDevRoleOverride,
    }),
    [
      authUser,
      orgId,
      effectiveRole,
      orgName,
      needsOrgSetup,
      profile,
      needsProfileSetup,
      loadingOrg,
      teamId,
      isDepartmentHead,
      isCoordinator,
      canSwitchTeams,
      subscription,
      plan,
      loadingSubscription,
      trialEndsAt,
      features,
      devRoleOverride,
    ],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

export default UserProvider;
