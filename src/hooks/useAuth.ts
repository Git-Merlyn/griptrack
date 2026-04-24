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
      // First fetch without team_id in case the schema migration hasn't run yet
      const { data: member, error: memberError } = await supabase
        .from('organization_members')
        .select('org_id, role, team_id')
        .eq('user_id', userId)
        .single();

      if (memberError || !member) {
        // If team_id column doesn't exist yet, fall back to org_id + role only
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

        const { data: { user } } = await supabase.auth.getUser();
        setProfile({
          id: userId,
          email: user?.email ?? '',
          full_name: user?.user_metadata?.full_name ?? null,
          org_id: fallback.org_id,
          team_id: null, // schema not migrated yet
          role: fallback.role as Role,
        });
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      setProfile({
        id: userId,
        email: user?.email ?? '',
        full_name: user?.user_metadata?.full_name ?? null,
        org_id: member.org_id,
        team_id: member.team_id ?? null,
        role: member.role as Role,
      });
    } finally {
      setLoading(false);
    }
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

  return { session, profile, loading, signIn, signOut, sendPasswordReset };
}
