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

  // Subscription
  subscription: null,   // { plan, status, current_period_end, cancel_at_period_end }
  plan: "free",         // derived: 'free' | 'pro' | 'team'
  loadingSubscription: false,

  // Trial
  trialEndsAt: null,    // ISO string from organizations.trial_ends_at

  // Org feature flags — owner can toggle these in /settings.
  // Default true so nothing breaks before the DB column is added.
  features: { teams_enabled: true, requests_enabled: true },
  updateFeature: async () => ({ error: null }),

  // Dev-only: override the real role for testing permission levels.
  // Always null in production (the setter is a no-op outside of DEV mode).
  devRoleOverride: null,
  setDevRoleOverride: () => {},
});

export default UserContext;
