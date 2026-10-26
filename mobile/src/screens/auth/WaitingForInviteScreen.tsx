import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useAuthContext } from '../../context/AuthContext';
import { useSyncContext } from '../../context/SyncContext';
import { invokeFn } from '../../lib/invokeFn';

/**
 * Shown to a user who signed up as crew ("I work on a team") and is not in
 * any organization yet (WP25). bootstrap_session accepts a pending invite for
 * their email, so "Check again" is just retryBootstrap; useAuth also re-checks
 * every time the app comes to the foreground while this screen is up.
 */
export default function WaitingForInviteScreen() {
  const { session, retryBootstrap, signOut } = useAuthContext();
  const { discardLocalData } = useSyncContext();
  const [busy, setBusy] = useState<'check' | 'signout' | 'delete' | null>(null);
  const [checked, setChecked] = useState(false);

  const email = session?.user?.email ?? '';

  async function check() {
    setBusy('check');
    try {
      await retryBootstrap();
      // Still here means no invite yet (an accepted one swaps this screen out).
      setChecked(true);
    } finally {
      setBusy(null);
    }
  }

  async function doSignOut() {
    setBusy('signout');
    try {
      await signOut();
    } finally {
      setBusy(null);
    }
  }

  // App Store 5.1.1(v): account deletion must be reachable from here too,
  // since this user never gets to the Profile tab.
  function confirmDelete() {
    Alert.alert('Delete account', 'This permanently deletes your account. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy('delete');
          try {
            await invokeFn('delete-account');
            discardLocalData();
            await signOut();
          } catch (e) {
            Alert.alert(
              'Cannot delete yet',
              e instanceof Error && e.message ? e.message : 'Account deletion failed. Please try again.'
            );
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
      <View className="px-6 py-12">
        <View className="bg-surface rounded-2xl p-6 border border-white/10">
          <Text className="text-slate-100 text-xl font-semibold mb-3">Waiting for an invite</Text>
          <Text className="text-text text-sm mb-3">
            Ask your team&apos;s admin to invite this email address from their Staff page:
          </Text>
          <View className="bg-background border border-white/10 rounded-lg px-4 py-3 mb-3">
            <Text className="text-slate-100" style={{ fontSize: 16 }} selectable testID="waiting-email">
              {email}
            </Text>
          </View>
          <Text className="text-text text-sm mb-5">
            You&apos;ll join their team automatically. GripTrack checks each time you open the app.
          </Text>

          {checked && (
            <Text className="text-text text-sm mb-4" accessibilityLiveRegion="polite">
              No invite yet. Check again once your admin has sent it.
            </Text>
          )}

          <TouchableOpacity
            className="bg-accent rounded-lg py-3.5 items-center mb-3"
            onPress={check}
            disabled={busy !== null}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Check again"
          >
            {busy === 'check' ? (
              <ActivityIndicator color="#0f1117" />
            ) : (
              <Text className="text-slate-900 font-semibold text-base">Check again</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            className="rounded-lg py-3.5 items-center border border-white/10"
            onPress={doSignOut}
            disabled={busy !== null}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            {busy === 'signout' ? (
              <ActivityIndicator color="#4debf9" />
            ) : (
              <Text className="text-slate-100 font-semibold text-base">Sign out</Text>
            )}
          </TouchableOpacity>

          <Text className="text-text/70 text-xs mt-5 text-center">
            Setting up your own company? Sign in on the GripTrack website.
          </Text>

          <TouchableOpacity
            className="mt-4 items-center py-2"
            onPress={confirmDelete}
            disabled={busy !== null}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Delete account"
          >
            {busy === 'delete' ? (
              <ActivityIndicator color="#ef4444" />
            ) : (
              <Text className="text-danger/60 text-xs">Delete account…</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}
