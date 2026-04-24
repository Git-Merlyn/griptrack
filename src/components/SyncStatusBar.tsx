/**
 * SyncStatusBar — a thin banner that appears only when there's something
 * worth communicating: offline, syncing, pending ops, or a sync error.
 * Hidden when everything is online and up to date.
 */

import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useSyncContext } from '../context/SyncContext';

export default function SyncStatusBar() {
  const { isOnline, isSyncing, syncError, pendingOps } = useSyncContext();

  // Nothing to show — online and idle
  if (isOnline && !isSyncing && !syncError && pendingOps === 0) return null;

  if (!isOnline) {
    return (
      <View className="bg-surface border-b border-white/10 px-4 py-2 flex-row items-center gap-2">
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
      <View className="bg-surface border-b border-white/10 px-4 py-2 flex-row items-center gap-2">
        <ActivityIndicator size="small" color="#4debf9" />
        <Text className="text-accent text-xs">Syncing…</Text>
      </View>
    );
  }

  if (syncError) {
    return (
      <View className="bg-surface border-b border-white/10 px-4 py-2 flex-row items-center gap-2">
        <View className="w-2 h-2 rounded-full bg-danger" />
        <Text className="text-danger text-xs flex-1" numberOfLines={1}>
          Sync error — {syncError}
        </Text>
      </View>
    );
  }

  // Online, not syncing, but has pending ops (e.g. sync just finished draining)
  if (pendingOps > 0) {
    return (
      <View className="bg-surface border-b border-white/10 px-4 py-2 flex-row items-center gap-2">
        <View className="w-2 h-2 rounded-full bg-warning" />
        <Text className="text-warning text-xs">{pendingOps} changes waiting to sync</Text>
      </View>
    );
  }

  return null;
}
