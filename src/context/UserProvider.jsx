import { useEffect, useMemo, useState } from "react";
import UserContext from "./UserContext";
import { supabase } from "@/lib/supabaseClient";

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

  // Subscription context
  const [subscription, setSubscription] = useState(null);
  const [loadingSubscription, setLoadingSubscription] = useState(false);

  // Trial
  const [trialEndsAt, setTrialEndsAt] = useState(null);

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
        setAuthUser(null);
        setOrgId(null);
        setRole(null);
        setOrgName("");
        setNeedsOrgSetup(false);
        setProfile(null);
        setNeedsProfileSetup(false);
        setLoadingOrg(false);
        setSubscription(null);
        setTrialEndsAt(null);
        return;
      }

      setAuthUser(session.user);
      setLoadingOrg(true);

      // Auto-link invited user to their org if applicable
      const { error: inviteError } = await supabase.rpc("accept_org_invite_for_user");
      if (inviteError) {
        console.warn("accept_org_invite_for_user failed", inviteError);
      }

      const { data, error } = await supabase.rpc("ensure_org_for_user");
      if (cancelled) return;

      if (error) {
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

      // Load org name
      if (nextOrgId) {
        const { data: orgRow, error: orgErr } = await supabase
          .from("organizations")
          .select("name, trial_ends_at")
          .eq("id", nextOrgId)
          .single();

        if (orgErr) {
          console.warn("Failed to load organization name", orgErr);
          setOrgName("");
          setNeedsOrgSetup(false);
          setTrialEndsAt(null);
        } else {
          const name = String(orgRow?.name || "").trim();
          setOrgName(name);
          setNeedsOrgSetup(isPlaceholderOrgName(name));
          setTrialEndsAt(orgRow?.trial_ends_at ?? null);
        }

        // Load subscription for org
        await loadSubscription(nextOrgId);
      } else {
        setOrgName("");
        setNeedsOrgSetup(true);
      }

      // Load user profile
      const { data: profileRow, error: profileErr } = await supabase
        .from("profiles")
        .select("id, email, full_name, phone")
        .eq("id", session.user.id)
        .single();

      if (profileErr) {
        // AbortError means the request was cancelled mid-flight (e.g. rapid
        // navigation on iOS Safari). Don't treat this as a real failure —
        // leave needsProfileSetup as-is so the user isn't wrongly redirected.
        if (profileErr.name === "AbortError" || profileErr.message?.includes("aborted")) {
          console.warn("Profile load aborted — skipping needsProfileSetup update");
        } else {
          console.warn("Failed to load profile", profileErr);
          setProfile(null);
          setNeedsProfileSetup(true);
        }
      } else {
        setProfile(profileRow ?? null);
        setNeedsProfileSetup(!String(profileRow?.full_name || "").trim());
      }

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
      role,
      orgName,
      needsOrgSetup,
      profile,
      needsProfileSetup,
      loadingOrg,
      subscription,
      plan,
      loadingSubscription,
      trialEndsAt,
      refreshSubscription: () => loadSubscription(orgId),
    }),
    [
      authUser,
      orgId,
      role,
      orgName,
      needsOrgSetup,
      profile,
      needsProfileSetup,
      loadingOrg,
      subscription,
      plan,
      loadingSubscription,
      trialEndsAt,
    ],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

export default UserProvider;
