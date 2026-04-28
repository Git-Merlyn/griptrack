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
import { useOrgMembers, OrgMemberProfile } from '../../hooks/useOrgMembers';
import { useOrgContext } from '../../context/OrgContext';
import { useAuthContext } from '../../context/AuthContext';
import { Role } from '../../lib/types';

// ─── Role config ──────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<Role, { label: string; bg: string; text: string }> = {
  owner:           { label: 'Owner',     bg: 'rgba(168,85,247,0.15)', text: '#c084fc' },
  admin:           { label: 'Admin',     bg: 'rgba(77,235,249,0.15)', text: '#4debf9' },
  department_head: { label: 'Dept Head', bg: 'rgba(251,191,36,0.15)', text: '#fbbf24' },
  crew:            { label: 'Crew',      bg: 'rgba(156,163,175,0.12)', text: '#9ca3af' },
};

// Roles an owner can assign to others (can't assign 'owner' from mobile)
const ASSIGNABLE_ROLES: Role[] = ['admin', 'department_head', 'crew'];

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

// ─── Add member modal ─────────────────────────────────────────────────────────

function AddMemberModal({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (email: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd() {
    if (!email.trim()) {
      Alert.alert('Required', 'Please enter an email address.');
      return;
    }
    setSubmitting(true);
    try {
      await onAdd(email.trim());
      setEmail('');
      onClose();
    } catch {
      // Error shown by parent
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setEmail('');
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
            <Text className="text-slate-100 text-lg font-semibold">Add Member</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <View style={{ padding: 20, paddingBottom: 40 }}>
            <Text className="text-text text-sm mb-1.5">Email address</Text>
            <TextInput
              className="bg-background border border-white/10 rounded-xl px-4 py-3 text-slate-100 text-base mb-2"
              placeholder="crew@example.com"
              placeholderTextColor="#4b5563"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleAdd}
            />
            <Text className="text-text text-xs mb-5">
              The person must already have a GripTrack account. They'll be added as Crew — you can change their role after.
            </Text>

            <TouchableOpacity
              className={`rounded-xl py-4 items-center ${submitting ? 'bg-accent/40' : 'bg-accent'}`}
              onPress={handleAdd}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#0f1117" />
              ) : (
                <Text className="text-slate-900 font-semibold text-base">Add member</Text>
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
  isSelf,
  isOwner,
  onChangeRole,
  onRemove,
}: {
  member: OrgMemberProfile;
  isSelf: boolean;
  isOwner: boolean;
  onChangeRole: () => void;
  onRemove: () => void;
}) {
  const initials = member.full_name
    ? member.full_name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : member.email[0].toUpperCase();

  const canEdit = isOwner && !isSelf && member.role !== 'owner';

  return (
    <View className="bg-surface border border-white/10 rounded-xl p-4">
      <View className="flex-row items-center gap-3">
        {/* Avatar */}
        <View className="w-10 h-10 rounded-full bg-accent/15 items-center justify-center">
          <Text className="text-accent font-bold text-sm">{initials}</Text>
        </View>

        {/* Name + email */}
        <View className="flex-1 min-w-0">
          <Text className="text-slate-100 font-medium" numberOfLines={1}>
            {member.full_name ?? '—'}
            {isSelf && <Text className="text-text font-normal"> (you)</Text>}
          </Text>
          <Text className="text-text text-xs mt-0.5" numberOfLines={1}>
            {member.email}
          </Text>
        </View>

        {/* Role badge */}
        <RoleBadge role={member.role} />
      </View>

      {/* Actions — owner only, not on self, not on other owners */}
      {canEdit && (
        <View className="flex-row gap-2 mt-3 pt-3 border-t border-white/5">
          <TouchableOpacity
            onPress={onChangeRole}
            className="flex-1 flex-row items-center justify-center gap-1.5 border border-white/10 rounded-lg py-2"
            activeOpacity={0.8}
          >
            <Ionicons name="shield-outline" size={14} color="#9ca3af" />
            <Text className="text-text text-xs font-medium">Change role</Text>
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
  const { members, loading, error, refresh, changeRole, removeMember, addMemberByEmail } =
    useOrgMembers(orgId);

  const [refreshing, setRefreshing] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);

  const isOwner = profile?.role === 'owner';

  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  function promptRoleChange(member: OrgMemberProfile) {
    const options = ASSIGNABLE_ROLES.map((r) => ROLE_CONFIG[r].label);

    Alert.alert(
      `Change role for ${member.full_name ?? member.email}`,
      'Select a new role:',
      [
        ...ASSIGNABLE_ROLES.map((role) => ({
          text: ROLE_CONFIG[role].label + (member.role === role ? ' ✓' : ''),
          onPress: async () => {
            if (role === member.role) return;
            try {
              await changeRole(member.id, role);
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'Failed to change role.');
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' },
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
              await removeMember(member.id);
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'Failed to remove member.');
            }
          },
        },
      ]
    );
  }

  async function handleAdd(email: string) {
    const result = await addMemberByEmail(email);

    if (result === 'not_found') {
      Alert.alert(
        'Account not found',
        `No GripTrack account found for ${email}. Ask them to sign up first.`
      );
      throw new Error('not_found'); // Keep modal open
    }

    if (result === 'already_member') {
      Alert.alert('Already a member', `${email} is already part of this org.`);
      throw new Error('already_member');
    }

    // result === 'added' — modal will close
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
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, paddingBottom: isOwner ? 96 : 24 }}
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
          renderItem={({ item }) => (
            <MemberCard
              member={item}
              isSelf={item.id === profile?.id}
              isOwner={isOwner}
              onChangeRole={() => promptRoleChange(item)}
              onRemove={() => confirmRemove(item)}
            />
          )}
        />
      )}

      {/* FAB — owner only */}
      {isOwner && (
        <TouchableOpacity
          className="absolute bottom-6 right-5 bg-accent w-14 h-14 rounded-full items-center justify-center shadow-lg"
          onPress={() => setAddModalVisible(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="person-add-outline" size={22} color="#0f1117" />
        </TouchableOpacity>
      )}

      <AddMemberModal
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        onAdd={handleAdd}
      />
    </View>
  );
}
