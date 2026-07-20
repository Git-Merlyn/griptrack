import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuthContext } from '../../context/AuthContext';

export default function ProfileScreen() {
  const { profile, signOut, session } = useAuthContext();

  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const initials =
    profile?.full_name
      ? profile.full_name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
      : (profile?.email?.[0]?.toUpperCase() ?? '?');

  const roleLabel = profile?.role
    ? profile.role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : '—';

  function cancelPasswordChange() {
    setChangingPassword(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
  }

  async function handleChangePassword() {
    if (!currentPassword) {
      Alert.alert('Required', 'Please enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Too short', 'New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'New passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      // Re-authenticate with current password to verify identity
      const email = session?.user.email ?? profile?.email ?? '';
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });

      if (signInError) {
        Alert.alert('Incorrect password', 'Your current password is wrong. Please try again.');
        return;
      }

      // Current password verified — update to new password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        Alert.alert('Error', updateError.message);
        return;
      }

      Alert.alert('Done', 'Your password has been updated.');
      cancelPasswordChange();
    } finally {
      setSaving(false);
    }
  }

  function confirmSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  }

  // App Store 5.1.1(v) / GDPR / PIPEDA: users must be able to delete their
  // account in-app. Two-step confirm; owners are warned the whole org goes.
  function confirmDeleteAccount() {
    const isOwner = profile?.role === 'owner';
    Alert.alert(
      'Delete account',
      isOwner
        ? 'This permanently deletes your account AND your organization — all equipment, history, locations, and settings. This cannot be undone.'
        : "This permanently deletes your account. Your organization's data is not affected. This cannot be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Are you absolutely sure?', 'There is no way to recover a deleted account.', [
              { text: 'Keep my account', style: 'cancel' },
              {
                text: 'Permanently delete',
                style: 'destructive',
                onPress: async () => {
                  try {
                    // Edge function: auto-cancels any active subscription,
                    // then deletes via the delete_my_account RPC. Blocked
                    // cases (org still has other members) come back as an
                    // error message.
                    const { data, error } = await supabase.functions.invoke('delete-account');
                    if (error || data?.error) {
                      let msg = data?.error || error?.message || 'Account deletion failed.';
                      try {
                        const body = await (error as any)?.context?.json?.();
                        if (body?.error) msg = body.error;
                      } catch { /* keep msg */ }
                      Alert.alert('Cannot delete yet', msg);
                      return;
                    }
                    await signOut();
                  } catch (e: any) {
                    // Network failure or an unexpected throw from
                    // functions.invoke — without this, the dialog just closed
                    // silently with no indication deletion failed.
                    Alert.alert('Cannot delete yet', e?.message || 'Account deletion failed. Please try again.');
                  }
                },
              },
            ]);
          },
        },
      ]
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Profile card ── */}
        <View className="bg-surface rounded-2xl p-5 border border-white/10 mb-4">
          <View className="w-14 h-14 rounded-full bg-accent/20 items-center justify-center mb-4">
            <Text className="text-accent text-2xl font-bold">{initials}</Text>
          </View>

          <Text className="text-slate-100 text-lg font-semibold">
            {profile?.full_name ?? 'No name set'}
          </Text>
          <Text className="text-text text-sm mt-0.5">{profile?.email}</Text>

          <View className="mt-3">
            <View className="bg-accent/15 border border-accent/25 rounded-full px-3 py-0.5 self-start">
              <Text className="text-accent text-xs font-medium">{roleLabel}</Text>
            </View>
          </View>
        </View>

        {/* ── Change password ── */}
        {changingPassword ? (
          <View className="bg-surface border border-white/10 rounded-2xl p-5 mb-4">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-slate-100 text-base font-semibold">Change password</Text>
              <TouchableOpacity onPress={cancelPasswordChange} hitSlop={8}>
                <Ionicons name="close" size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <PasswordField
              label="Current password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              show={showCurrent}
              onToggleShow={() => setShowCurrent((v) => !v)}
              returnKeyType="next"
            />
            <View className="h-3" />
            <PasswordField
              label="New password"
              value={newPassword}
              onChangeText={setNewPassword}
              show={showNew}
              onToggleShow={() => setShowNew((v) => !v)}
              returnKeyType="next"
            />
            <View className="h-3" />
            <PasswordField
              label="Confirm new password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              show={showConfirm}
              onToggleShow={() => setShowConfirm((v) => !v)}
              returnKeyType="done"
              onSubmit={handleChangePassword}
            />

            <TouchableOpacity
              className={`mt-5 rounded-xl py-3.5 items-center ${saving ? 'bg-accent/40' : 'bg-accent'}`}
              onPress={handleChangePassword}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#0f1117" />
              ) : (
                <Text className="text-slate-900 font-semibold">Update password</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            className="bg-surface border border-white/10 rounded-xl p-4 flex-row items-center gap-3 mb-4"
            onPress={() => setChangingPassword(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="lock-closed-outline" size={20} color="#4debf9" />
            <Text className="text-slate-100 font-medium">Change password</Text>
            <Ionicons name="chevron-forward" size={16} color="#6b7280" style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
        )}

        {/* ── Sign out ── */}
        <TouchableOpacity
          className="bg-surface border border-danger/25 rounded-xl p-4 items-center"
          onPress={confirmSignOut}
          activeOpacity={0.8}
        >
          <Text className="text-danger font-medium">Sign out</Text>
        </TouchableOpacity>

        {/* ── Delete account ── */}
        <TouchableOpacity
          className="mt-3 p-3 items-center"
          onPress={confirmDeleteAccount}
          activeOpacity={0.7}
        >
          <Text className="text-danger/60 text-xs">Delete account…</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Password field ───────────────────────────────────────────────────────────

interface PasswordFieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  returnKeyType?: 'next' | 'done';
  onSubmit?: () => void;
}

function PasswordField({
  label,
  value,
  onChangeText,
  show,
  onToggleShow,
  returnKeyType = 'next',
  onSubmit,
}: PasswordFieldProps) {
  return (
    <View>
      <Text className="text-text text-xs mb-1.5">{label}</Text>
      <View className="flex-row items-center bg-background border border-white/15 rounded-xl px-3">
        <TextInput
          className="flex-1 py-3.5 text-slate-100"
          style={{ fontSize: 16 }}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmit}
        />
        <TouchableOpacity onPress={onToggleShow} hitSlop={8}>
          <Ionicons
            name={show ? 'eye-off-outline' : 'eye-outline'}
            size={18}
            color="#6b7280"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}
