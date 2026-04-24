import React from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { InventoryStackParamList } from '../../lib/types';
import { useAuditLog, AuditEvent } from '../../hooks/useAuditLog';

type Props = NativeStackScreenProps<InventoryStackParamList, 'AuditLog'>;

// ─── Action badge config ──────────────────────────────────────────────────────

const ACTION_META: Record<string, { label: string; color: string; bg: string }> = {
  create: { label: 'Created',  color: '#2ecc71', bg: 'rgba(46,204,113,0.15)' },
  edit:   { label: 'Edited',   color: '#4debf9', bg: 'rgba(77,235,249,0.12)' },
  move:   { label: 'Moved',    color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  merge:  { label: 'Merged',   color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  damage: { label: 'Damaged',  color: '#ff4d4d', bg: 'rgba(255,77,77,0.15)' },
  delete: { label: 'Deleted',  color: '#ff4d4d', bg: 'rgba(255,77,77,0.15)' },
};

function ActionBadge({ action }: { action: string }) {
  const meta = ACTION_META[action.toLowerCase()] ?? {
    label: action,
    color: '#9ca3af',
    bg: 'rgba(156,163,175,0.15)',
  };
  return (
    <View style={{ backgroundColor: meta.bg }} className="rounded-full px-2.5 py-0.5">
      <Text style={{ color: meta.color }} className="text-xs font-semibold">
        {meta.label}
      </Text>
    </View>
  );
}

// ─── Timestamp ────────────────────────────────────────────────────────────────

function formatTs(ts: string): string {
  try {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

// ─── Single log entry ─────────────────────────────────────────────────────────

function LogEntry({ log }: { log: AuditEvent }) {
  const hasLocation = log.from_location || log.to_location;
  const hasDelta = log.delta_qty != null;
  const notes = log.meta?.notes as string | undefined;

  // Prefer actor (display name) — fall back to shortened user_id
  const actorDisplay =
    log.actor ||
    (log.user_id ? `User ${log.user_id.slice(-6)}` : null);

  return (
    <View className="py-3.5 border-b border-white/5 last:border-0">
      {/* Top row: badge + timestamp */}
      <View className="flex-row items-center justify-between mb-1.5">
        <ActionBadge action={log.action} />
        <Text className="text-text text-xs">{formatTs(log.created_at)}</Text>
      </View>

      {/* Actor */}
      {actorDisplay && (
        <Text className="text-text text-xs mb-1">
          by <Text className="text-slate-300">{actorDisplay}</Text>
        </Text>
      )}

      {/* Location change */}
      {hasLocation && (
        <View className="flex-row items-center gap-1.5 flex-wrap mb-1">
          {log.from_location && (
            <Text className="text-text text-xs">
              from <Text className="text-slate-200">{log.from_location}</Text>
            </Text>
          )}
          {log.from_location && log.to_location && (
            <Ionicons name="arrow-forward" size={12} color="#6b7280" />
          )}
          {log.to_location && (
            <Text className="text-text text-xs">
              {!log.from_location && 'to '}
              <Text className="text-slate-200">{log.to_location}</Text>
            </Text>
          )}
        </View>
      )}

      {/* Qty delta */}
      {hasDelta && (
        <Text className="text-text text-xs">
          qty{' '}
          <Text
            style={{
              color: (log.delta_qty ?? 0) >= 0 ? '#2ecc71' : '#ff4d4d',
            }}
            className="font-semibold"
          >
            {(log.delta_qty ?? 0) > 0 ? `+${log.delta_qty}` : log.delta_qty}
          </Text>
        </Text>
      )}

      {/* Notes from meta */}
      {notes && (
        <View className="mt-1.5 border-l-2 border-white/15 pl-2.5">
          <Text className="text-slate-400 text-xs">{notes}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AuditLogScreen({ route }: Props) {
  const { item } = route.params;
  const { logs, loading, error, refresh } = useAuditLog(item.id);

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color="#4debf9" size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6 gap-4">
        <Text className="text-danger text-sm text-center">{error}</Text>
        <TouchableOpacity
          className="border border-white/15 rounded-xl px-4 py-2"
          onPress={refresh}
        >
          <Text className="text-slate-300 text-sm">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={logs}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={refresh} tintColor="#4debf9" />
        }
        ListHeaderComponent={
          <View className="py-3 flex-row items-center justify-between">
            <Text className="text-text text-xs">
              {logs.length} event{logs.length !== 1 ? 's' : ''}
            </Text>
            <TouchableOpacity onPress={refresh} hitSlop={8}>
              <Text className="text-accent text-xs">Refresh</Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          <View className="items-center justify-center pt-20">
            <Ionicons name="time-outline" size={40} color="#374151" />
            <Text className="text-text mt-3 text-sm">No history recorded yet</Text>
          </View>
        }
        renderItem={({ item: log }) => <LogEntry log={log} />}
      />
    </View>
  );
}
