/**
 * SyncStatusBar — a thin banner that appears only when there's something
 * worth communicating: offline, syncing, pending ops, or a sync error.
 * Hidden when everything is online and up to date.
 */

import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSyncContext } from '../context/SyncContext';

export default function SyncStatusBar() {
  const { isOnline, isSyncing, syncError, syncNotice, pendingOps } = useSyncContext();
  const insets = useSafeAreaInsets();

  // Nothing to show — online and idle
  if (isOnline && !isSyncing && !syncError && !syncNotice && pendingOps === 0) return null;

  // Pad the top so the bar sits below the system status bar (notch / Dynamic Island)
  const topPad = { paddingTop: insets.top + 4 };

  if (!isOnline) {
    return (
      <View style={topPad} className="bg-surface border-b border-white/10 px-4 pb-2 flex-row items-center gap-2">
        <View className="w-2 h-2 rounded-full bg-warning" />
        <Text className="text-warning text-xs flex-1">
          Offline — changes will sync when reconnected
          {pendingOps > 0 ? ` (${pendingOps} pending)` : ''}
        </Text>
      </View>
    );
  }

  if (isSyncing) {
    return (
      <View style={topPad} className="bg-surface border-b border-white/10 px-4 pb-2 flex-row items-center gap-2">
        <ActivityIndicator size="small" color="#4debf9" />
        <Text className="text-accent text-xs">Syncing…</Text>
      </View>
    );
  }

  if (syncError) {
    return (
      <View style={topPad} className="bg-surface border-b border-white/10 px-4 pb-2 flex-row items-center gap-2">
        <View className="w-2 h-2 rounded-full bg-danger" />
        <Text className="text-danger text-xs flex-1" numberOfLines={1}>
          Sync error — {syncError}
        </Text>
      </View>
    );
  }

  // Transient conflict notice — some offline changes were skipped or dropped
  if (syncNotice) {
    return (
      <View style={topPad} className="bg-surface border-b border-white/10 px-4 pb-2 flex-row items-center gap-2">
        <View className="w-2 h-2 rounded-full bg-warning" />
        <Text className="text-warning text-xs flex-1" numberOfLines={2}>
          {syncNotice}
        </Text>
      </View>
    );
  }

  // Online, not syncing, but has pending ops (e.g. sync just finished draining)
  if (pendingOps > 0) {
    return (
      <View style={topPad} className="bg-surface border-b border-white/10 px-4 pb-2 flex-row items-center gap-2">
        <View className="w-2 h-2 rounded-full bg-warning" />
        <Text className="text-warning text-xs">{pendingOps} changes waiting to sync</Text>
      </View>
    );
  }

  return null;
}
