import { useState, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { UserProfile, Role } from '../lib/types';

interface UseAuthReturn {
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updateFullName: (name: string) => Promise<{ error: string | null }>;
}

export function useAuth(): UseAuthReturn {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadProfile(session.user.id);
      else setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string) {
    setLoading(true);
    try {
      // Fetch org membership (try with team_id first, fall back if column missing)
      const { data: member, error: memberError } = await supabase
        .from('organization_members')
        .select('org_id, role, team_id')
        .eq('user_id', userId)
        .single();

      const { data: { user } } = await supabase.auth.getUser();

      // Fetch display name from the profiles table (same source the web app uses).
      // Fall back to user_metadata if the profiles table query fails.
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', userId)
        .maybeSingle();

      const fullName =
        profileRow?.full_name?.trim() ||
        user?.user_metadata?.full_name?.trim() ||
        null;

      if (memberError || !member) {
        // Fallback: org_id + role without team_id (schema migration not yet run)
        const { data: fallback, error: fallbackError } = await supabase
          .from('organization_members')
          .select('org_id, role')
          .eq('user_id', userId)
          .single();

        if (fallbackError || !fallback) {
          console.error('Failed to load org membership:', fallbackError?.message);
          setProfile(null);
          return;
        }

        setProfile({
          id: userId,
          email: user?.email ?? '',
          full_name: fullName,
          org_id: fallback.org_id,
          team_id: null,
          role: fallback.role as Role,
        });
        return;
      }

      setProfile({
        id: userId,
        email: user?.email ?? '',
        full_name: fullName,
        org_id: member.org_id,
        team_id: member.team_id ?? null,
        role: member.role as Role,
      });
    } finally {
      setLoading(false);
    }
  }

  async function updateFullName(name: string): Promise<{ error: string | null }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    const trimmed = name.trim();
    if (!trimmed) return { error: 'Name cannot be empty' };

    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email ?? '',
      full_name: trimmed,
    });

    if (error) return { error: error.message };

    // Update local profile state immediately
    setProfile((prev) => prev ? { ...prev, full_name: trimmed } : prev);
    return { error: null };
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function sendPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { error: error?.message ?? null };
  }

  return { session, profile, loading, signIn, signOut, sendPasswordReset, updateFullName };
}
