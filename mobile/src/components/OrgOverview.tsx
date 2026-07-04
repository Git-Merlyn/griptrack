/**
 * OrgOverview — shown to admin/owner when no active team is selected.
 *
 * Displays all teams for the org as tappable cards. Each card shows the
 * team name and a live item count fetched from Supabase (falls back to
 * "—" if offline or the query fails). Tapping a card switches to that team.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../lib/supabase';
import { Team } from '../lib/types';
import { useAuthContext } from '../context/AuthContext';
import { useTeamContext } from '../context/TeamContext';
import { useSyncContext } from '../context/SyncContext';

export default function OrgOverview() {
  const { profile } = useAuthContext();
  const { teams, loadingTeams, setActiveTeamId, refreshTeams } = useTeamContext();
  const { isOnline } = useSyncContext();

  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchItemCounts() {
    if (!profile?.org_id || !isOnline) return;
    setLoadingCounts(true);
    try {
      // Fetch all team_id values for this org — count client-side
      const { data, error } = await supabase
        .from('equipment_items')
        .select('team_id')
        .eq('org_id', profile.org_id)
        .neq('name', '__placeholder__');

      if (error) throw error;

      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        if (row.team_id) {
          counts[row.team_id] = (counts[row.team_id] ?? 0) + 1;
        }
      }
      setItemCounts(counts);
    } catch (e) {
      console.warn('[OrgOverview] failed to fetch item counts', e);
    } finally {
      setLoadingCounts(false);
    }
  }

  useEffect(() => {
    fetchItemCounts();
  }, [profile?.org_id, isOnline, teams.length]);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([refreshTeams(), fetchItemCounts()]);
    setRefreshing(false);
  }

  if (loadingTeams) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#4debf9" size="large" />
      </View>
    );
  }

  return (
    <FlatList
      data={teams}
      keyExtractor={(t) => t.id}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#4debf9" />
      }
      ListHeaderComponent={
        <View className="mb-5">
          <Text className="text-slate-100 text-xl font-bold">Organisation</Text>
          <Text className="text-text text-sm mt-1">
            Tap a team to view its inventory
          </Text>
          {!isOnline && (
            <View className="mt-3 flex-row items-center gap-2 bg-warning/10 border border-warning/25 rounded-lg px-3 py-2">
              <Ionicons name="cloud-offline-outline" size={14} color="#ffd600" />
              <Text className="text-warning text-xs">Offline — item counts unavailable</Text>
            </View>
          )}
        </View>
      }
      ItemSeparatorComponent={() => <View className="h-3" />}
      ListEmptyComponent={
        <View className="items-center justify-center pt-20">
          <Ionicons name="people-outline" size={40} color="#374151" />
          <Text className="text-text mt-3 text-sm">No teams found for this org</Text>
        </View>
      }
      renderItem={({ item: team }) => (
        <TeamCard
          team={team}
          count={itemCounts[team.id]}
          loadingCounts={loadingCounts}
          isOnline={isOnline}
          onPress={() => setActiveTeamId(team.id)}
        />
      )}
    />
  );
}

// ─── Team card ────────────────────────────────────────────────────────────────

interface TeamCardProps {
  team: Team;
  count: number | undefined;
  loadingCounts: boolean;
  isOnline: boolean;
  onPress: () => void;
}

function TeamCard({ team, count, loadingCounts, isOnline, onPress }: TeamCardProps) {
  const countLabel = !isOnline
    ? '—'
    : loadingCounts
    ? null  // show spinner
    : `${count ?? 0} item${(count ?? 0) !== 1 ? 's' : ''}`;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      className="bg-surface border border-white/10 rounded-2xl p-5 flex-row items-center justify-between"
    >
      <View className="flex-1 mr-4">
        <Text className="text-accent text-base font-semibold mb-1" numberOfLines={1}>
          {team.name}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="cube-outline" size={13} color="#6b7280" />
          {loadingCounts && isOnline ? (
            <ActivityIndicator size="small" color="#6b7280" />
          ) : (
            <Text className="text-text text-sm">{countLabel}</Text>
          )}
        </View>
        {team.max_seats != null && (
          <View className="flex-row items-center gap-1.5 mt-1">
            <Ionicons name="people-outline" size={13} color="#6b7280" />
            <Text className="text-text text-sm">{team.max_seats} seat{team.max_seats !== 1 ? 's' : ''}</Text>
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color="#4debf9" />
    </TouchableOpacity>
  );
}
