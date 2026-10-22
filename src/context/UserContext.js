import { createContext } from "react";

const UserContext = createContext({
  // Supabase auth
  authUser: null,
  logout: () => {},

  // Org
  orgId: null,
  role: null,          // 'crew' | 'department_head' | 'admin' | 'owner'
  orgName: "",
  needsOrgSetup: false,
  profile: null,
  needsProfileSetup: false,
  loadingOrg: true,

  // Team (the user's assigned department team)
  teamId: null,        // from organization_members.team_id

  // Role helpers — derived from role
  isDepartmentHead: false,   // role === 'department_head'
  isCoordinator: false,      // role === 'admin' || role === 'owner'
  canSwitchTeams: false,     // admin/owner can view any team; others are locked

  // Platform-admin ghost session (see GhostBar). A ghost is reported as role
  // 'owner'. ghostReadOnly = viewing another org without armed write: every
  // write control must be hidden (RLS refuses the writes anyway).
  isGhost: false,
  ghostReadOnly: false,

  // Subscription
  subscription: null,   // { plan, status, current_period_end, cancel_at_period_end }
  plan: "free",         // derived: 'free' | 'pro' | 'team' (billed plan)
  effectivePlan: "free", // plan used for gating: pro/team while active, trialing or past_due
  loadingSubscription: false,
  refreshSubscription: async () => null, // (opts?: { silent?: boolean }) => row | null

  // Trial
  trialEndsAt: null,    // ISO string from organizations.trial_ends_at

  // Org feature flags — owner can toggle these in /settings.
  // Default off — teams/requests are opt-in; real values come from bootstrap.
  features: { teams_enabled: false, requests_enabled: false },
  updateFeature: async () => ({ error: null }),

  // Apply a saved org name / profile row to provider state (OrgSetup,
  // CompleteProfile, InviteAccept) so onboarding gates update without reload.
  applyOrgName: () => {},
  applyProfile: () => {},

  // Dev-only: override the real role for testing permission levels.
  // Always null in production (the setter is a no-op outside of DEV mode).
  devRoleOverride: null,
  setDevRoleOverride: () => {},
});

export default UserContext;
