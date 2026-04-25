import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import { useAuth } from '../hooks/useAuth';
import { UserProfile, Role } from '../lib/types';

interface AuthContextValue {
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updateFullName: (name: string) => Promise<{ error: string | null }>;
  /** Dev-only: the role that overrides profile.role in __DEV__ builds */
  roleOverride: Role | null;
  /** Dev-only: set to override the active role, null to clear */
  setRoleOverride: (role: Role | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [roleOverride, setRoleOverride] = useState<Role | null>(null);

  // Swap role in profile when an override is active — all downstream permission
  // helpers (canManageInventory, isOrgAdmin, etc.) update automatically.
  const effectiveProfile =
    auth.profile && roleOverride ? { ...auth.profile, role: roleOverride } : auth.profile;

  return (
    <AuthContext.Provider value={{ ...auth, profile: effectiveProfile, roleOverride, setRoleOverride }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within <AuthProvider>');
  return ctx;
}
