import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Role } from '../lib/types';

export interface OrgMemberProfile {
  id: string;
  full_name: string | null;
  email: string;
  role: Role;
  team_id: string | null;
}

interface UseOrgMembersResult {
  members: OrgMemberProfile[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  changeRole: (memberId: string, role: Role) => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
  addMemberByEmail: (email: string) => Promise<'added' | 'not_found' | 'already_member'>;
}

export function useOrgMembers(orgId: string | null): UseOrgMembersResult {
  const [members, setMembers] = useState<OrgMemberProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, team_id')
      .eq('org_id', orgId)
      .order('role', { ascending: true })
      .order('full_name', { ascending: true });

    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }

    setMembers((data ?? []) as OrgMemberProfile[]);
  }, [orgId]);

  useEffect(() => { fetch(); }, [fetch]);

  async function changeRole(memberId: string, role: Role) {
    // Optimistic update
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, role } : m))
    );

    const { error: err } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', memberId);

    if (err) {
      // Revert and re-fetch on failure
      await fetch();
      throw new Error(err.message);
    }
  }

  async function removeMember(memberId: string) {
    // Remove from org by clearing org_id and team_id
    const { error: err } = await supabase
      .from('profiles')
      .update({ org_id: null, team_id: null, role: 'crew' })
      .eq('id', memberId);

    if (err) throw new Error(err.message);

    // Remove from local list immediately
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
  }

  async function addMemberByEmail(email: string): Promise<'added' | 'not_found' | 'already_member'> {
    const normalised = email.trim().toLowerCase();

    // Look up a profile with this email that has no org yet
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, team_id, org_id')
      .eq('email', normalised)
      .maybeSingle();

    if (err) throw new Error(err.message);
    if (!data) return 'not_found';
    if (data.org_id === orgId) return 'already_member';

    // Assign them to this org as crew
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ org_id: orgId, role: 'crew', team_id: null })
      .eq('id', data.id);

    if (updateErr) throw new Error(updateErr.message);

    // Add to local list
    setMembers((prev) => [
      ...prev,
      { id: data.id, full_name: data.full_name, email: data.email, role: 'crew', team_id: null },
    ]);

    return 'added';
  }

  return {
    members,
    loading,
    error,
    refresh: fetch,
    changeRole,
    removeMember,
    addMemberByEmail,
  };
}
