import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAuthContext } from '../../context/AuthContext';

/**
 * Shown when a user is signed in but has no org identity: bootstrap_session
 * failed and nothing is cached, or the very first launch is offline (L59, H7).
 * Before this screen the app rendered an empty shell with no way out.
 */
export default function OrgUnavailableScreen() {
  const { offline, bootError, retryBootstrap, signOut } = useAuthContext();
  const [busy, setBusy] = useState<'retry' | 'signout' | null>(null);

  const title = offline ? "You're offline" : "Couldn't load your organization";
  const body = offline
    ? 'Connect to the internet to finish signing in. Your inventory will appear once GripTrack can reach the server.'
    : 'Check your connection and try again. If this keeps happening, sign in on the GripTrack website to finish setting up your account.';

  async function run(kind: 'retry' | 'signout') {
    setBusy(kind);
    try {
      if (kind === 'retry') await retryBootstrap();
      else await signOut();
    } finally {
      setBusy(null);
    }
  }

  return (
    <View className="flex-1 justify-center bg-background px-6">
      <View className="bg-surface rounded-2xl p-6 border border-white/10">
        <Text className="text-slate-100 text-xl font-semibold mb-3">{title}</Text>
        <Text className="text-text text-sm mb-4">{body}</Text>
        {!!bootError && !offline && (
          <Text className="text-danger text-xs mb-4" selectable>
            {bootError}
          </Text>
        )}

        <TouchableOpacity
          className="bg-accent rounded-lg py-3.5 items-center mb-3"
          onPress={() => run('retry')}
          disabled={busy !== null}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          {busy === 'retry' ? (
            <ActivityIndicator color="#0f1117" />
          ) : (
            <Text className="text-slate-900 font-semibold text-base">Try again</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          className="rounded-lg py-3.5 items-center border border-white/10"
          onPress={() => run('signout')}
          disabled={busy !== null}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          {busy === 'signout' ? (
            <ActivityIndicator color="#4debf9" />
          ) : (
            <Text className="text-accent font-semibold text-base">Sign out</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
