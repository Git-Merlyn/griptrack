import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { invokeFn } from '../lib/invokeFn';
import { Role } from '../lib/types';

/**
 * Org member management — mirrors the web app's Staff page.
 *
 * Membership, roles, and team assignment live in `organization_members`
 * (keyed by org_id + user_id); `profiles` only supplies display name/email.
 * Invites go through the `invite-staff` edge function and are tracked in
 * `org_invites`, exactly like the web app.
 */

export interface OrgMemberProfile {
  user_id: string;
  full_name: string | null;
  email: string;
  role: Role;
  team_id: string | null;
  created_at: string;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: Role;
  team_id: string | null;
  created_at: string;
}

interface UseOrgMembersResult {
  members: OrgMemberProfile[];
  invites: PendingInvite[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  changeRole: (userId: string, role: Role) => Promise<void>;
  changeTeam: (userId: string, teamId: string | null) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  /**
   * Resolves once the invite is recorded. The server never says whether the
   * address already has an account (C1), so there is nothing to return.
   */
  inviteMember: (email: string, role: Role, teamId: string | null) => Promise<void>;
  revokeInvite: (inviteId: string) => Promise<void>;
  resendInvite: (invite: PendingInvite) => Promise<void>;
}

export function useOrgMembers(orgId: string | null): UseOrgMembersResult {
  const [members, setMembers] = useState<OrgMemberProfile[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);

    try {
      const { data: memberRows, error: membersErr } = await supabase
        .from('organization_members')
        .select('user_id, role, team_id, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true });

      if (membersErr) throw membersErr;

      // Names/emails come from profiles — fetched separately since there's no
      // FK join exposed between the two tables.
      const userIds = (memberRows ?? []).map((r) => r.user_id).filter(Boolean);
      let profileMap = new Map<string, { full_name: string | null; email: string }>();
      if (userIds.length > 0) {
        const { data: profileRows } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .in('id', userIds);
        profileMap = new Map(
          (profileRows ?? []).map((p) => [p.id, { full_name: p.full_name, email: p.email }])
        );
      }

      setMembers(
        (memberRows ?? []).map((r) => {
          const p = profileMap.get(r.user_id);
          return {
            user_id: r.user_id,
            role: r.role as Role,
            team_id: r.team_id ?? null,
            created_at: r.created_at,
            full_name: p?.full_name ?? null,
            email: p?.email ?? r.user_id,
          };
        })
      );

      const { data: inviteRows, error: invitesErr } = await supabase
        .from('org_invites')
        .select('id, email, role, team_id, created_at')
        .eq('org_id', orgId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (!invitesErr) setInvites((inviteRows ?? []) as PendingInvite[]);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetch(); }, [fetch]);

  async function changeRole(userId: string, role: Role) {
    // Optimistic update
    setMembers((prev) => prev.map((m) => (m.user_id === userId ? { ...m, role } : m)));

    const { error: err } = await supabase
      .from('organization_members')
      .update({ role })
      .eq('org_id', orgId)
      .eq('user_id', userId);

    if (err) {
      await fetch(); // revert to server state
      throw new Error(err.message);
    }
  }

  async function changeTeam(userId: string, teamId: string | null) {
    setMembers((prev) => prev.map((m) => (m.user_id === userId ? { ...m, team_id: teamId } : m)));

    const { error: err } = await supabase
      .from('organization_members')
      .update({ team_id: teamId })
      .eq('org_id', orgId)
      .eq('user_id', userId);

    if (err) {
      await fetch();
      throw new Error(err.message);
    }
  }

  async function removeMember(userId: string) {
    const { data: deleted, error: err } = await supabase
      .from('organization_members')
      .delete()
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .select('user_id');

    if (err) throw new Error(err.message);
    if (!deleted?.length) throw new Error('Failed to remove member.');

    setMembers((prev) => prev.filter((m) => m.user_id !== userId));
  }

  async function inviteMember(email: string, role: Role, teamId: string | null): Promise<void> {
    // invokeFn throws with the function's own message ("Admins only",
    // "Invite limit reached (20 per hour)") instead of the generic non-2xx text.
    await invokeFn('invite-staff', { body: { email: email.trim(), orgId, role, teamId } });

    await fetch();
  }

  async function revokeInvite(inviteId: string) {
    // Clients may only flip a pending invite to 'revoked' (RLS + column grant).
    // .select() so an RLS-filtered no-op is detected instead of reported as done.
    const { data: revoked, error: err } = await supabase
      .from('org_invites')
      .update({ status: 'revoked' })
      .eq('id', inviteId)
      .eq('status', 'pending')
      .select('id');

    if (err) throw new Error(err.message);
    if (!revoked?.length) {
      await fetch();
      throw new Error('This invite was already accepted or revoked.');
    }

    setInvites((prev) => prev.filter((i) => i.id !== inviteId));
  }

  async function resendInvite(invite: PendingInvite) {
    // Same edge function as a new invite: refreshes the row and re-sends the email.
    await inviteMember(invite.email, invite.role, invite.team_id ?? null);
  }

  return {
    members,
    invites,
    loading,
    error,
    refresh: fetch,
    changeRole,
    changeTeam,
    removeMember,
    inviteMember,
    revokeInvite,
    resendInvite,
  };
}
