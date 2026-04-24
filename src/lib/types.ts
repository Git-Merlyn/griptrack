// ─── Core domain types ────────────────────────────────────────────────────────

export interface EquipmentItem {
  id: string;
  org_id: string;
  production_id: string | null; // null = General pool
  item_id: string | null;
  name: string;
  category: string | null;
  source: string | null;
  quantity: number;
  reserve_min: number;
  location: string;
  status: string; // 'Available' | 'Out' | 'Damaged' | etc.
  start_date: string | null;
  end_date: string | null;
  updated_by: string;
  created_at: string;
}

export interface Location {
  id: string;
  org_id: string;
  name: string;
  is_active: boolean;
}

export interface Production {
  id: string;
  org_id: string;
  name: string;
  status: 'active' | 'archived';
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export interface OrgMember {
  org_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'crew';
  status: string;
}

// ─── Auth / session ───────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  org_id: string;
  role: 'owner' | 'admin' | 'crew';
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
