import React from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useAuthContext } from '../../context/AuthContext';

export default function ProfileScreen() {
  const { profile, signOut } = useAuthContext();

  function confirmSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  }

  return (
    <View className="flex-1 bg-background px-4 pt-6">
      {/* Profile card */}
      <View className="bg-surface rounded-2xl p-5 border border-white/10 mb-4">
        <View className="w-14 h-14 rounded-full bg-accent/20 items-center justify-center mb-3">
          <Text className="text-accent text-2xl font-bold">
            {profile?.full_name?.[0]?.toUpperCase() ?? profile?.email?.[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>

        <Text className="text-slate-100 text-lg font-semibold">
          {profile?.full_name ?? 'No name set'}
        </Text>
        <Text className="text-text text-sm mt-0.5">{profile?.email}</Text>

        <View className="mt-3 flex-row items-center gap-2">
          <View className="bg-accent/15 border border-accent/25 rounded-full px-3 py-0.5">
            <Text className="text-accent text-xs font-medium capitalize">
              {profile?.role ?? '—'}
            </Text>
          </View>
        </View>
      </View>

      {/* Sign out */}
      <TouchableOpacity
        className="bg-surface border border-danger/25 rounded-xl p-4 items-center"
        onPress={confirmSignOut}
        activeOpacity={0.8}
      >
        <Text className="text-danger font-medium">Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}
