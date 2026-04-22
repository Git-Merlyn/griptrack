import { createContext } from "react";

const UserContext = createContext({
  // Supabase auth
  authUser: null,
  logout: () => {},

  // Org
  orgId: null,
  role: null,
  orgName: "",
  needsOrgSetup: false,
  profile: null,
  needsProfileSetup: false,
  loadingOrg: true,

  // Subscription
  subscription: null,   // { plan, status, current_period_end, cancel_at_period_end }
  plan: "free",         // derived: 'free' | 'pro' | 'team'
  loadingSubscription: false,

  // Trial
  trialEndsAt: null,    // ISO string from organizations.trial_ends_at
});

export default UserContext;
