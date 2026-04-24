// ─── Roles ────────────────────────────────────────────────────────────────────

export type Role = 'owner' | 'admin' | 'department_head' | 'crew';

/** Roles that can manage inventory (add/edit items, approve requests) */
export function canManageInventory(role: Role): boolean {
  return role === 'owner' || role === 'admin' || role === 'department_head';
}

/** Roles that can see all teams and switch between them */
export function canSwitchTeams(role: Role): boolean {
  return role === 'owner' || role === 'admin';
}

/** Roles that can delete items or manage users across all teams */
export function isOrgAdmin(role: Role): boolean {
  return role === 'owner' || role === 'admin';
}

// ─── Core domain types ────────────────────────────────────────────────────────

export interface EquipmentItem {
  id: string;
  org_id: string;
  team_id: string;           // every item belongs to a team (no null)
  item_id: string | null;
  name: string;
  category: string | null;
  source: string | null;
  quantity: number;
  reserve_min: number;
  location: string;
  status: string;            // 'Available' | 'Out' | 'Damaged' | etc.
  start_date: string | null;
  end_date: string | null;
  updated_by: string;        // kept for display; audit log stores user_id separately
  created_at: string;
}

export interface Location {
  id: string;
  org_id: string;
  name: string;
  is_active: boolean;
}

export interface Team {
  id: string;
  org_id: string;
  name: string;              // e.g. 'Grip', 'Electric', 'Camera'
  max_seats: number | null;
}

export interface OrgMember {
  org_id: string;
  user_id: string;
  team_id: string;
  role: Role;
  status: string;
}

// ─── Auth / session ───────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  org_id: string;
  team_id: string | null;    // null until schema migration adds team_id to organization_members
  role: Role;
}

// ─── Navigation param lists ───────────────────────────────────────────────────

export type RootStackParamList = {
  Auth: undefined;
  App: undefined;
};

export type AuthStackParamList = {
  SignIn: undefined;
  ForgotPassword: undefined;
};

export type AppTabParamList = {
  Inventory: undefined;
  Move: undefined;
  Requests: undefined;
  Profile: undefined;
};

export type InventoryStackParamList = {
  InventoryList: undefined;
  ItemDetail: { item: EquipmentItem };
};
