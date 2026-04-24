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
      // Load org membership — now includes team_id and the expanded role
      const { data: member, error: memberError } = await supabase
        .from('organization_members')
        .select('org_id, team_id, role')
        .eq('user_id', userId)
        .single();

      if (memberError || !member) {
        console.error('Failed to load org membership:', memberError?.message);
        setProfile(null);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();

      setProfile({
        id: userId,
        email: user?.email ?? '',
        full_name: user?.user_metadata?.full_name ?? null,
        org_id: member.org_id,
        team_id: member.team_id,
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
