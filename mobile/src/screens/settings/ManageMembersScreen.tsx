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
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOrgMembers, OrgMemberProfile } from '../../hooks/useOrgMembers';
import { useOrgContext } from '../../context/OrgContext';
import { useAuthContext } from '../../context/AuthContext';
import { useTeamContext } from '../../context/TeamContext';
import { Role, isOrgAdmin, ASSIGNABLE_ROLES } from '../../lib/types';

// ─── Role config ──────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<Role, { label: string; bg: string; text: string }> = {
  owner:           { label: 'Owner',     bg: 'rgba(168,85,247,0.15)', text: '#c084fc' },
  admin:           { label: 'Admin',     bg: 'rgba(77,235,249,0.15)', text: '#4debf9' },
  department_head: { label: 'Dept Head', bg: 'rgba(251,191,36,0.15)', text: '#fbbf24' },
  crew:            { label: 'Crew',      bg: 'rgba(156,163,175,0.12)', text: '#9ca3af' },
};


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
            <TouchableOpacity onPress={handleClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <View style={{ padding: 20, paddingBottom: 40 }}>
            <Text className="text-text text-sm mb-1.5">Email address</Text>
            <TextInput
              className="bg-background border border-white/10 rounded-xl px-4 py-3 text-slate-100 text-base leading-relaxed mb-4"
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
  const initials = member.full_name
    ? member.full_name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : member.email[0].toUpperCase();

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
  const { teams } = useTeamContext();
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

  function promptRoleChange(member: OrgMemberProfile) {
    Alert.alert(
      `Change role for ${member.full_name ?? member.email}`,
      'Select a new role:',
      [
        ...ASSIGNABLE_ROLES.map((role) => ({
          text: ROLE_CONFIG[role].label + (member.role === role ? ' ✓' : ''),
          onPress: async () => {
            if (role === member.role) return;
            try {
              await changeRole(member.user_id, role);
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'Failed to change role.');
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]
    );
  }

  function promptTeamChange(member: OrgMemberProfile) {
    Alert.alert(
      `Assign team for ${member.full_name ?? member.email}`,
      'Select a team:',
      [
        ...teams.map((t) => ({
          text: t.name + (member.team_id === t.id ? ' ✓' : ''),
          onPress: async () => {
            if (member.team_id === t.id) return;
            try {
              await changeTeam(member.user_id, t.id);
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'Failed to change team.');
            }
          },
        })),
        {
          text: 'No team' + (member.team_id === null ? ' ✓' : ''),
          onPress: async () => {
            if (member.team_id === null) return;
            try {
              await changeTeam(member.user_id, null);
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'Failed to change team.');
            }
          },
        },
        { text: 'Cancel', style: 'cancel' as const },
      ]
    );
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

  async function handleInvite(email: string, role: Role) {
    try {
      // New members join without a team; assign one from the member card after.
      const { generatedLink } = await inviteMember(email, role, null);

      if (generatedLink) {
        Alert.alert(
          'User already registered',
          'This person already has a GripTrack account. Share the sign-in link so they can join your org.',
          [
            { text: 'Done', style: 'cancel' },
            { text: 'Share link', onPress: () => Share.share({ message: generatedLink }) },
          ]
        );
      } else {
        Alert.alert('Invite sent', `An invitation was emailed to ${email}.`);
      }
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
          ItemSeparatorComponent={() => <View className="h-3" />}
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
                  <View
                    key={inv.id}
                    className="flex-row items-center justify-between bg-surface border border-white/10 rounded-xl px-4 py-3 mb-2"
                  >
                    <View className="flex-1 min-w-0 flex-row items-center gap-2">
                      <Text className="text-slate-100 text-sm" numberOfLines={1}>
                        {inv.email}
                      </Text>
                      <RoleBadge role={inv.role} />
                    </View>
                    <Text className="text-text text-xs">Pending</Text>
                  </View>
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
              onChangeRole={() => promptRoleChange(item)}
              onChangeTeam={() => promptTeamChange(item)}
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
        >
          <Ionicons name="person-add-outline" size={22} color="#0f1117" />
        </TouchableOpacity>
      )}

      <InviteMemberModal
        visible={inviteModalVisible}
        onClose={() => setInviteModalVisible(false)}
        onInvite={handleInvite}
      />
    </View>
  );
}
