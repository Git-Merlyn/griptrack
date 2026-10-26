import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Sentry from "@sentry/react";
import UserContext from "./UserContext";
import { supabase } from "@/lib/supabaseClient";
import { signOutWithLocalFallback } from "@/lib/signOut";
import { isPlaceholderOrgName } from "@/lib/orgName";
import { canSwitchTeams as roleCanSwitchTeams, isOrgAdmin } from "@shared/roles";
import { computeEffectivePlan } from "@/lib/plan";

// Ghost state when the session is NOT a platform-admin ghost (the normal case).
const GHOST_OFF = { active: false, canWrite: false };

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

  // Set when bootstrap_session fails; App renders BootstrapErrorScreen (L3).
  const [bootstrapError, setBootstrapError] = useState(null);
  // From bootstrap_session: platform admin (gates GhostBar, L7) and whether
  // this bootstrap accepted an org invite (InviteAccept, L28).
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [inviteAccepted, setInviteAccepted] = useState(false);
  // Signed up as crew ("I work on a team") and not in any org yet: App
  // shows the waiting-for-an-invite page instead of org setup (WP25).
  const [awaitingInvite, setAwaitingInvite] = useState(false);
  // Latest ensureOrg from the auth effect, so rebootstrap() can re-run it.
  const ensureOrgRef = useRef(null);

  // Team assignment (from organization_members.team_id)
  const [teamId, setTeamId] = useState(null);

  // Platform-admin "ghost" session (bootstrap_session.ghost / ghost_write).
  // A ghost is reported as role 'owner' so every page renders, but unless
  // write is armed RLS refuses every write, so write controls are hidden.
  const [ghost, setGhost] = useState(GHOST_OFF);

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

  // Org feature flags. Default OFF — teams/requests are opt-in; the real
  // values arrive from bootstrap_session. A stale "on" default would flash
  // team UI for a teams-off org during load.
  const [features, setFeatures] = useState({ teams_enabled: false, requests_enabled: false });

  // User id whose org/profile bootstrap has fully completed. Lets the auth
  // listener ignore repeat events for the same user (see below).
  const bootstrappedUserIdRef = useRef(null);

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
    setGhost(GHOST_OFF);
    setBootstrapError(null);
    setIsPlatformAdmin(false);
    setInviteAccepted(false);
    setAwaitingInvite(false);

    // Never throws; clears the stored session itself if /logout is unreachable (L31).
    await signOutWithLocalFallback();

    window.location.href = "/auth";
  };

  // Re-reads the org's subscriptions row and returns it (null on error).
  // { silent: true } skips the loadingSubscription flag so BillingPage can
  // poll after a Stripe redirect without blanking the page on each poll.
  const loadSubscription = async (currentOrgId, { silent = false } = {}) => {
    if (!currentOrgId) return null;

    if (!silent) setLoadingSubscription(true);
    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("plan, status, current_period_end, cancel_at_period_end")
        .eq("org_id", currentOrgId)
        .maybeSingle();

      if (error) {
        console.warn("Failed to load subscription", error);
        return null;
      }

      setSubscription(data ?? null);
      return data ?? null;
    } catch (e) {
      console.warn("Subscription load error", e);
      return null;
    } finally {
      if (!silent) setLoadingSubscription(false);
    }
  };

  useEffect(() => {
    let unsub = null;
    let cancelled = false;

    // fromInvite: the page was opened from an invite link. bootstrap_session
    // then does not auto-create a "New Company" org when no invite was
    // accepted (L28). rebootstrap() always passes false.
    const ensureOrg = async (
      session,
      { fromInvite = window.location.pathname === "/invite-accept" } = {},
    ) => {
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
        setGhost(GHOST_OFF);
        setBootstrapError(null);
        setIsPlatformAdmin(false);
        setInviteAccepted(false);
        setAwaitingInvite(false);
        return;
      }

      setAuthUser(session.user);
      setLoadingOrg(true);
      setBootstrapError(null);

      // Single round trip: invite acceptance + org ensure + org row +
      // subscription + team assignment + profile, all from one RPC.
      // (Previously six serial requests — the bulk of the loading screen.)
      let { data: boot, error } = fromInvite
        ? await supabase.rpc("bootstrap_session", { p_from_invite: true })
        : await supabase.rpc("bootstrap_session");
      // Until the bootstrap_session(boolean) migration is live, PostgREST
      // answers PGRST202 (no such function): fall back to the old call.
      if (fromInvite && error?.code === "PGRST202") {
        ({ data: boot, error } = await supabase.rpc("bootstrap_session"));
      }
      if (cancelled) return;

      if (error || !boot) {
        const bootError = error ?? new Error("bootstrap_session returned no data");
        console.error("bootstrap_session failed", bootError);
        Sentry.captureException(bootError, { tags: { area: "bootstrap_session" } });
        setOrgId(null);
        setRole(null);
        setOrgName("");
        setNeedsOrgSetup(false);
        setProfile(null);
        setNeedsProfileSetup(false);
        setTeamId(null);
        setGhost(GHOST_OFF);
        setSubscription(null);
        setTrialEndsAt(null);
        setFeatures({ teams_enabled: false, requests_enabled: false });
        setIsPlatformAdmin(false);
        setInviteAccepted(false);
        setAwaitingInvite(false);
        // App shows BootstrapErrorScreen (Try again / Sign out) while this is
        // set, instead of rendering the app with orgId null (L3).
        setBootstrapError(bootError);
        setLoadingOrg(false);
        return;
      }

      const nextOrgId = boot.org_id ?? null;
      const awaiting = !nextOrgId && boot.signup_role === "crew";
      setAwaitingInvite(awaiting);
      setIsPlatformAdmin(boot.is_platform_admin === true);
      setInviteAccepted(boot.invite_accepted === true);
      setOrgId(nextOrgId);
      setRole(boot.role ?? null);

      if (nextOrgId && boot.org) {
        const name = String(boot.org.name || "").trim();
        setOrgName(name);
        setNeedsOrgSetup(isPlaceholderOrgName(name));
        setTrialEndsAt(boot.org.trial_ends_at ?? null);
        // Off by default — both features are opt-in. Existing orgs were
        // backfilled with an explicit flag, so this fallback only affects
        // genuinely-unset orgs.
        setFeatures({
          teams_enabled:    boot.org.features?.teams_enabled    ?? false,
          requests_enabled: boot.org.features?.requests_enabled ?? false,
        });
      } else {
        setOrgName("");
        setNeedsOrgSetup(!awaiting);
      }

      setSubscription(boot.subscription ?? null);
      setTeamId(boot.team_id ?? null);
      // Strict === true: an older payload without these keys means "not a ghost".
      setGhost({ active: boot.ghost === true, canWrite: boot.ghost_write === true });

      const profileRow = boot.profile ?? null;
      setProfile(profileRow);
      setNeedsProfileSetup(!String(profileRow?.full_name || "").trim());

      // Bootstrap finished for this user — later auth events for the same
      // user (token refresh, tab refocus) don't need to repeat it.
      bootstrappedUserIdRef.current = session.user.id;
      setLoadingOrg(false);
    };

    ensureOrgRef.current = ensureOrg;

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
      ensureOrgRef.current = null;
      try {
        unsub?.unsubscribe?.();
      } catch {
        // ignore
      }
    };
  }, []);

  // Re-run bootstrap for the current session (BootstrapErrorScreen "Try
  // again"). Always the plain bootstrap, never the invite variant.
  const rebootstrap = useCallback(async () => {
    const run = ensureOrgRef.current;
    if (!run) return;
    const { data } = await supabase.auth.getSession();
    await run(data?.session ?? null, { fromInvite: false });
  }, []);

  // Role helpers — derived from role string.
  // In dev mode, devRoleOverride takes precedence so the DevPanel can simulate any role.
  const effectiveRole = (import.meta.env.DEV && devRoleOverride) ? devRoleOverride : role;
  const isDepartmentHead = effectiveRole === "department_head";
  const isCoordinator = !!effectiveRole && isOrgAdmin(effectiveRole);
  // admin/owner can browse any team; crew/dept_head are locked to their assigned team
  const canSwitchTeams = !!effectiveRole && roleCanSwitchTeams(effectiveRole);
  // Ghost flags (L1). ghostReadOnly: viewing another org without armed write.
  // Pages keep their read UI (role is 'owner') but must hide write controls.
  // Snapshot from bootstrap: an armed window that expires mid-session still
  // shows write controls until the next reload, and RLS refuses the write.
  const isGhost = ghost.active;
  const ghostReadOnly = ghost.active && !ghost.canWrite;

  // Toggle an org-level feature flag. Owner-only: RLS ("owners can update
  // their organization") enforces it, but an RLS-refused UPDATE returns 2xx
  // with ZERO rows and no error — so ask for the row back and only change
  // local state from what the server actually stored.
  const updateFeature = async (key, enabled) => {
    const newFeatures = { ...features, [key]: enabled };
    const { data, error } = await supabase
      .from("organizations")
      .update({ features: newFeatures })
      .eq("id", orgId)
      .select("id, features");
    if (error) return { error };
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      return { error: new Error("Only the organization owner can change features.") };
    }
    setFeatures({
      teams_enabled:    row.features?.teams_enabled    ?? false,
      requests_enabled: row.features?.requests_enabled ?? false,
    });
    return { error: null };
  };

  // Called after OrgSetup / CompleteProfile / InviteAccept save, with the row
  // the server returned, so the onboarding redirects in App.jsx see the new
  // state immediately (previously App kept its own shadow flags).
  const applyOrgName = useCallback((name) => {
    const trimmed = String(name || "").trim();
    setOrgName(trimmed);
    setNeedsOrgSetup(isPlaceholderOrgName(trimmed));
  }, []);

  const applyProfile = useCallback((row) => {
    setProfile(row ?? null);
    setNeedsProfileSetup(!String(row?.full_name || "").trim());
  }, []);

  // Derive the active plan — treat any non-active subscription as free
  const plan = useMemo(() => {
    if (!subscription) return "free";
    if (subscription.status === "active" || subscription.status === "trialing") {
      return subscription.plan ?? "free";
    }
    return "free";
  }, [subscription]);

  // Plan used for feature gating (PaywallGate, plan-limit UI): the paid plan
  // while its subscription is active, trialing or past_due, else "free".
  // organizations.trial_ends_at grants nothing (there is no org trial).
  // `plan` above stays the billed plan — BillingPage/PricingPage rely on it.
  // Mirrors public.org_effective_plan() server-side (audit M9).
  const effectivePlan = useMemo(
    () => computeEffectivePlan({ subscription }),
    [subscription],
  );

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
      // Ghost (platform admin viewing another org)
      isGhost,
      ghostReadOnly,
      // Bootstrap (L3, L7, L28)
      bootstrapError,
      rebootstrap,
      isPlatformAdmin,
      inviteAccepted,
      awaitingInvite,
      // Subscription
      subscription,
      plan,
      effectivePlan,
      loadingSubscription,
      trialEndsAt,
      refreshSubscription: (opts) => loadSubscription(orgId, opts),
      // Features
      features,
      updateFeature,
      // Onboarding
      applyOrgName,
      applyProfile,
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
      isGhost,
      ghostReadOnly,
      subscription,
      plan,
      effectivePlan,
      loadingSubscription,
      trialEndsAt,
      features,
      bootstrapError,
      rebootstrap,
      isPlatformAdmin,
      inviteAccepted,
      awaitingInvite,
      applyOrgName,
      applyProfile,
      devRoleOverride,
    ],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

export default UserProvider;
