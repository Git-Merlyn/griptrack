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
import { useAuthContext } from '../../context/AuthContext';

export default function ProfileScreen() {
  const { profile, signOut, updateFullName } = useAuthContext();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  const initials =
    profile?.full_name
      ? profile.full_name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
      : (profile?.email?.[0]?.toUpperCase() ?? '?');

  function startEditing() {
    setNameInput(profile?.full_name ?? '');
    setEditingName(true);
  }

  function cancelEditing() {
    setEditingName(false);
    setNameInput('');
  }

  async function saveName() {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      Alert.alert('Name required', 'Please enter a display name.');
      return;
    }
    setSavingName(true);
    const { error } = await updateFullName(trimmed);
    setSavingName(false);

    if (error) {
      Alert.alert('Error', error);
    } else {
      setEditingName(false);
    }
  }

  function confirmSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  }

  const roleLabel = profile?.role
    ? profile.role.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : '—';

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
          {/* Avatar */}
          <View className="w-14 h-14 rounded-full bg-accent/20 items-center justify-center mb-4">
            <Text className="text-accent text-2xl font-bold">{initials}</Text>
          </View>

          {/* Name row */}
          {editingName ? (
            <View className="mb-3">
              <Text className="text-text text-xs mb-1.5">Display name</Text>
              <View className="flex-row items-center gap-2">
                <TextInput
                  className="flex-1 bg-background border border-white/15 rounded-xl px-3 py-2.5 text-slate-100 text-base"
                  value={nameInput}
                  onChangeText={setNameInput}
                  placeholder="Your name"
                  placeholderTextColor="#4b5563"
                  autoFocus
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={saveName}
                />
                <TouchableOpacity
                  onPress={saveName}
                  disabled={savingName}
                  className="bg-accent rounded-xl px-4 py-2.5 items-center justify-center"
                  activeOpacity={0.8}
                >
                  {savingName ? (
                    <ActivityIndicator size="small" color="#0f1117" />
                  ) : (
                    <Text className="text-slate-900 text-sm font-semibold">Save</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={cancelEditing} hitSlop={8}>
                  <Ionicons name="close" size={20} color="#6b7280" />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              className="flex-row items-center gap-2 mb-1"
              onPress={startEditing}
              activeOpacity={0.7}
            >
              <Text className="text-slate-100 text-lg font-semibold">
                {profile?.full_name ?? 'Tap to set your name'}
              </Text>
              <Ionicons name="pencil-outline" size={15} color="#6b7280" />
            </TouchableOpacity>
          )}

          {/* Email */}
          <Text className="text-text text-sm">{profile?.email}</Text>

          {/* Role badge */}
          <View className="mt-3 flex-row items-center gap-2">
            <View className="bg-accent/15 border border-accent/25 rounded-full px-3 py-0.5">
              <Text className="text-accent text-xs font-medium">{roleLabel}</Text>
            </View>
          </View>
        </View>

        {/* ── Sign out ── */}
        <TouchableOpacity
          className="bg-surface border border-danger/25 rounded-xl p-4 items-center"
          onPress={confirmSignOut}
          activeOpacity={0.8}
        >
          <Text className="text-danger font-medium">Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
