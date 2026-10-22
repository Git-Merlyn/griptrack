import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOrgMembers, OrgMemberProfile, PendingInvite } from '../../hooks/useOrgMembers';
import { useOrgContext } from '../../context/OrgContext';
import { useAuthContext } from '../../context/AuthContext';
import { useTeamContext } from '../../context/TeamContext';
import { Role, isOrgAdmin, ASSIGNABLE_ROLES } from '../../lib/types';
import { getInitials } from '../../lib/helpers';
import PickerModal from '../../components/PickerModal';
import IconButton from '../../components/IconButton';
import { GapMd } from '../../components/ListSeparators';

// ─── Role config ──────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<Role, { label: string; bg: string; text: string }> = {
  owner:           { label: 'Owner',     bg: 'rgba(168,85,247,0.15)', text: '#c084fc' },
  admin:           { label: 'Admin',     bg: 'rgba(77,235,249,0.15)', text: '#4debf9' },
  department_head: { label: 'Dept Head', bg: 'rgba(251,191,36,0.15)', text: '#fbbf24' },
  crew:            { label: 'Crew',      bg: 'rgba(156,163,175,0.12)', text: '#9ca3af' },
};


// PickerModal option key for "no team" (team ids are UUIDs, so no clash).
const NO_TEAM_KEY = '__none__';

function RoleBadge({ role }: { role: Role }) {
  const cfg = ROLE_CONFIG[role] ?? ROLE_CONFIG.crew;
  return (
    <View style={{ backgroundColor: cfg.bg }} className="rounded-full px-2.5 py-0.5">
      <Text style={{ color: cfg.text }} className="text-xs font-semibold">
        {cfg.label}
      </Text>
    </View>
  );
}

// ─── Invite member modal ──────────────────────────────────────────────────────

function InviteMemberModal({
  visible,
  onClose,
  onInvite,
}: {
  visible: boolean;
  onClose: () => void;
  onInvite: (email: string, role: Role) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('crew');
  const [submitting, setSubmitting] = useState(false);

  async function handleInvite() {
    if (!email.trim()) {
      Alert.alert('Required', 'Please enter an email address.');
      return;
    }
    setSubmitting(true);
    try {
      await onInvite(email.trim(), role);
      setEmail('');
      setRole('crew');
      onClose();
    } catch {
      // Error shown by parent
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setEmail('');
    setRole('crew');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable className="flex-1 bg-black/60" onPress={handleClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View className="bg-surface rounded-t-3xl border-t border-white/10">
          <View className="items-center pt-3 pb-1">
            <View className="w-10 h-1 bg-white/20 rounded-full" />
          </View>

          <View className="px-5 pt-3 pb-2 flex-row items-center justify-between">
            <Text className="text-slate-100 text-lg font-semibold">Invite Member</Text>
            <IconButton icon="close" label="Close" onPress={handleClose} />
          </View>

          <View style={{ padding: 20, paddingBottom: 40 }}>
            <Text className="text-text text-sm mb-1.5">Email address</Text>
            <TextInput
              className="bg-background border border-white/10 rounded-xl px-4 py-3.5 text-slate-100 mb-4"
              style={{ fontSize: 16 }}
              placeholder="crew@example.com"
              placeholderTextColor="#4b5563"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleInvite}
            />

            <Text className="text-text text-sm mb-1.5">Role</Text>
            <View className="flex-row gap-2 mb-5">
              {ASSIGNABLE_ROLES.map((r) => (
                <TouchableOpacity
                  key={r}
                  onPress={() => setRole(r)}
                  className={`flex-1 items-center rounded-xl py-2.5 border ${
                    role === r ? 'bg-accent/15 border-accent/40' : 'bg-background border-white/10'
                  }`}
                  activeOpacity={0.8}
                >
                  <Text
                    className={`text-xs font-medium ${role === r ? 'text-accent' : 'text-text'}`}
                  >
                    {ROLE_CONFIG[r].label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              className={`rounded-xl py-4 items-center ${submitting ? 'bg-accent/40' : 'bg-accent'}`}
              onPress={handleInvite}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#0f1117" />
              ) : (
                <Text className="text-slate-900 font-semibold text-base">Send invite</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Member card ──────────────────────────────────────────────────────────────

function MemberCard({
  member,
  teamName,
  isSelf,
  canManage,
  onChangeRole,
  onChangeTeam,
  onRemove,
}: {
  member: OrgMemberProfile;
  teamName: string | null;
  isSelf: boolean;
  canManage: boolean;
  onChangeRole: () => void;
  onChangeTeam: () => void;
  onRemove: () => void;
}) {
  const initials = getInitials(member.full_name, member.email);

  const canEdit = canManage && !isSelf && member.role !== 'owner';

  return (
    <View className="bg-surface border border-white/10 rounded-xl p-4">
      <View className="flex-row items-center gap-3">
        {/* Avatar */}
        <View className="w-10 h-10 rounded-full bg-accent/15 items-center justify-center">
          <Text className="text-accent font-bold text-sm">{initials}</Text>
        </View>

        {/* Name + email + team */}
        <View className="flex-1 min-w-0">
          <Text className="text-slate-100 font-medium" numberOfLines={1}>
            {member.full_name ?? '—'}
            {isSelf && <Text className="text-text font-normal"> (you)</Text>}
          </Text>
          <Text className="text-text text-xs mt-0.5" numberOfLines={1}>
            {member.email}
          </Text>
          <Text className="text-text/70 text-xs mt-0.5" numberOfLines={1}>
            {teamName ?? 'No team'}
          </Text>
        </View>

        {/* Role badge */}
        <RoleBadge role={member.role} />
      </View>

      {/* Actions — admins/owner only, not on self, not on the owner */}
      {canEdit && (
        <View className="flex-row gap-2 mt-3 pt-3 border-t border-white/5">
          <TouchableOpacity
            onPress={onChangeRole}
            className="flex-1 flex-row items-center justify-center gap-1.5 border border-white/10 rounded-lg py-2"
            activeOpacity={0.8}
          >
            <Ionicons name="shield-outline" size={14} color="#9ca3af" />
            <Text className="text-text text-xs font-medium">Role</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onChangeTeam}
            className="flex-1 flex-row items-center justify-center gap-1.5 border border-white/10 rounded-lg py-2"
            activeOpacity={0.8}
          >
            <Ionicons name="people-outline" size={14} color="#9ca3af" />
            <Text className="text-text text-xs font-medium">Team</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onRemove}
            className="flex-row items-center justify-center gap-1.5 border border-danger/25 rounded-lg px-4 py-2"
            activeOpacity={0.8}
          >
            <Ionicons name="person-remove-outline" size={14} color="#ff4d4d" />
            <Text className="text-danger text-xs font-medium">Remove</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ManageMembersScreen() {
  const { orgId } = useOrgContext();
  const { profile } = useAuthContext();
  const { teams, activeTeamId } = useTeamContext();
  const {
    members,
    invites,
    loading,
    error,
    refresh,
    changeRole,
    changeTeam,
    removeMember,
    inviteMember,
    revokeInvite,
    resendInvite,
  } = useOrgMembers(orgId);

  const [refreshing, setRefreshing] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);

  // Owner and admins manage staff — same rule as the web app's Staff page.
  const canManage = profile?.role != null && isOrgAdmin(profile.role);

  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));

  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  // Role and team are picked in a bottom sheet, not Alert.alert: Android's
  // Alert keeps only the first 3 buttons (Cancel, "No team" and any team past
  // the third vanished) and ignores back / outside taps.
  const [roleTarget, setRoleTarget] = useState<OrgMemberProfile | null>(null);
  const [teamTarget, setTeamTarget] = useState<OrgMemberProfile | null>(null);

  async function handleRoleSelect(key: string) {
    const member = roleTarget;
    const role = key as Role;
    if (!member || role === member.role) return;
    try {
      await changeRole(member.user_id, role);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to change role.');
    }
  }

  async function handleTeamSelect(key: string) {
    const member = teamTarget;
    if (!member) return;
    const teamId = key === NO_TEAM_KEY ? null : key;
    if (teamId === member.team_id) return;
    try {
      await changeTeam(member.user_id, teamId);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to change team.');
    }
  }

  function confirmRemove(member: OrgMemberProfile) {
    Alert.alert(
      'Remove member',
      `Remove ${member.full_name ?? member.email} from the org? They'll lose access immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeMember(member.user_id);
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'Failed to remove member.');
            }
          },
        },
      ]
    );
  }

  function promptInviteAction(invite: PendingInvite) {
    // Three buttons max so Android shows all of them.
    Alert.alert(invite.email, 'This invite has not been accepted yet.', [
      {
        text: 'Resend',
        onPress: async () => {
          try {
            await resendInvite(invite);
            Alert.alert('Invite re-sent', `Invite re-sent to ${invite.email}.`);
          } catch (err: any) {
            Alert.alert('Resend failed', err?.message ?? 'Could not resend the invite.');
          }
        },
      },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          try {
            await revokeInvite(invite.id);
          } catch (err: any) {
            Alert.alert('Error', err?.message ?? 'Failed to revoke invite.');
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ], { cancelable: true });
  }

  async function handleInvite(email: string, role: Role) {
    const normalizedEmail = email.trim().toLowerCase();
    if (members.some((m) => m.email.toLowerCase() === normalizedEmail)) {
      Alert.alert('Already a member', `${email} is already in your organization. Change their role from the member list.`);
      throw new Error('already a member'); // keep modal open
    }
    try {
      // Default the invitee to whatever team is active for the inviter. When
      // teams are off (or "all teams" is selected) activeTeamId is null, so
      // they join with no team and can be assigned from the member card.
      await inviteMember(email, role, activeTeamId);

      // Same message whether or not the address already has an account: the
      // server deliberately does not reveal which (C1).
      Alert.alert(
        'Invite sent',
        `Invite sent to ${email}. If they already have a GripTrack account, they'll join the next time they sign in.`
      );
    } catch (err: any) {
      Alert.alert('Invite failed', err?.message ?? 'Could not send the invite.');
      throw err; // keep modal open
    }
  }

  return (
    <View className="flex-1 bg-background">
      {error && (
        <View className="mx-4 mt-3 bg-danger/10 border border-danger/30 rounded-lg px-4 py-3">
          <Text className="text-danger text-sm">{error}</Text>
        </View>
      )}

      {loading && !refreshing ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#4debf9" size="large" />
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(m) => m.user_id}
          contentContainerStyle={{ padding: 16, paddingBottom: canManage ? 96 : 24 }}
          ItemSeparatorComponent={GapMd}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#4debf9" />
          }
          ListHeaderComponent={
            <Text className="text-text text-xs mb-4">
              {members.length} member{members.length !== 1 ? 's' : ''}
            </Text>
          }
          ListEmptyComponent={
            <View className="items-center justify-center pt-20">
              <Ionicons name="people-outline" size={40} color="#374151" />
              <Text className="text-text mt-3 text-sm">No members found</Text>
            </View>
          }
          ListFooterComponent={
            invites.length > 0 ? (
              <View className="mt-6">
                <Text className="text-text text-xs uppercase tracking-widest mb-3">
                  Pending invites
                </Text>
                {invites.map((inv) => (
                  <TouchableOpacity
                    key={inv.id}
                    disabled={!canManage}
                    onPress={() => promptInviteAction(inv)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Pending invite for ${inv.email}`}
                    className="flex-row items-center justify-between bg-surface border border-white/10 rounded-xl px-4 py-3 mb-2"
                  >
                    <View className="flex-1 min-w-0 flex-row items-center gap-2">
                      <Text className="text-slate-100 text-sm" numberOfLines={1}>
                        {inv.email}
                      </Text>
                      <RoleBadge role={inv.role} />
                    </View>
                    <View className="flex-row items-center gap-1">
                      <Text className="text-text text-xs">Pending</Text>
                      {canManage && <Ionicons name="ellipsis-horizontal" size={14} color="#9ca3af" />}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <MemberCard
              member={item}
              teamName={item.team_id ? teamNameById.get(item.team_id) ?? null : null}
              isSelf={item.user_id === profile?.id}
              canManage={canManage}
              onChangeRole={() => setRoleTarget(item)}
              onChangeTeam={() => setTeamTarget(item)}
              onRemove={() => confirmRemove(item)}
            />
          )}
        />
      )}

      {/* FAB — owner/admin only */}
      {canManage && (
        <TouchableOpacity
          className="absolute bottom-6 right-5 bg-accent w-14 h-14 rounded-full items-center justify-center shadow-lg"
          onPress={() => setInviteModalVisible(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Invite member"
        >
          <Ionicons name="person-add-outline" size={22} color="#0f1117" />
        </TouchableOpacity>
      )}

      <PickerModal
        visible={roleTarget !== null}
        title={roleTarget ? `Change role for ${roleTarget.full_name ?? roleTarget.email}` : ''}
        options={ASSIGNABLE_ROLES.map((r) => ({ key: r, label: ROLE_CONFIG[r].label }))}
        selectedKey={roleTarget?.role ?? null}
        onSelect={handleRoleSelect}
        onClose={() => setRoleTarget(null)}
      />

      <PickerModal
        visible={teamTarget !== null}
        title={teamTarget ? `Assign team for ${teamTarget.full_name ?? teamTarget.email}` : ''}
        options={[
          ...teams.map((t) => ({ key: t.id, label: t.name })),
          { key: NO_TEAM_KEY, label: 'No team' },
        ]}
        selectedKey={teamTarget ? teamTarget.team_id ?? NO_TEAM_KEY : null}
        onSelect={handleTeamSelect}
        onClose={() => setTeamTarget(null)}
      />

      <InviteMemberModal
        visible={inviteModalVisible}
        onClose={() => setInviteModalVisible(false)}
        onInvite={handleInvite}
      />
    </View>
  );
}
