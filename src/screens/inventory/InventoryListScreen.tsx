import React, { useLayoutEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { InventoryStackParamList, EquipmentItem, canManageInventory } from '../../lib/types';
import { useInventory } from '../../hooks/useInventory';
import { useTeamContext } from '../../context/TeamContext';
import { useAuthContext } from '../../context/AuthContext';
import TeamSwitcher from '../../components/TeamSwitcher';
import OrgOverview from '../../components/OrgOverview';
import { useOrgContext } from '../../context/OrgContext';
import { statusColor, getQty, qtyColor } from '../../lib/helpers';

type Props = NativeStackScreenProps<InventoryStackParamList, 'InventoryList'>;

export default function InventoryListScreen({ navigation }: Props) {
  const { filteredEquipment, equipment, loading, error, searchQuery, setSearchQuery, refresh } =
    useInventory();
  const { activeTeam, activeTeamId, canSwitch, loadingTeams } = useTeamContext();
  const { profile } = useAuthContext();
  const { features } = useOrgContext();

  // Teams feature flag: when off, suppress all team-switching UI
  const teamsActive = canSwitch && features.teamsEnabled;

  const [switcherVisible, setSwitcherVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showBelowReserve, setShowBelowReserve] = useState(false);

  const canManage = profile?.role != null && canManageInventory(profile.role);

  // Apply below-reserve filter on top of search filter
  const displayItems = useMemo(() => {
    if (!showBelowReserve) return filteredEquipment;
    return filteredEquipment.filter((item) => {
      const qty = getQty(item);
      const reserve = Number(item.reserve_min) || 0;
      return reserve > 0 && qty < reserve;
    });
  }, [filteredEquipment, showBelowReserve]);

  // Count of below-reserve items (for badge)
  const belowReserveCount = useMemo(
    () => equipment.filter((i) => {
      const qty = getQty(i);
      const r = Number(i.reserve_min) || 0;
      return r > 0 && qty < r;
    }).length,
    [equipment]
  );

  // Admin/owner with no active team and teams feature on — show org overview
  const showOrgOverview = teamsActive && !activeTeamId && !loadingTeams;

  useLayoutEffect(() => {
    navigation.setOptions({
      // Only admin/owner get an interactive team switcher in the header,
      // and only when the teams feature is enabled for this org.
      headerRight: () =>
        teamsActive && activeTeam ? (
          <TouchableOpacity
            onPress={() => setSwitcherVisible(true)}
            className="flex-row items-center gap-1.5 mr-1"
            hitSlop={8}
          >
            <Ionicons name="people-outline" size={16} color="#4debf9" />
            <Text className="text-accent text-sm font-medium" numberOfLines={1}>
              {activeTeam.name}
            </Text>
            <Ionicons name="chevron-down" size={14} color="#4debf9" />
          </TouchableOpacity>
        ) : undefined,
    });
  }, [navigation, activeTeam, teamsActive]);

  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  if (showOrgOverview) {
    return (
      <View className="flex-1 bg-background">
        <OrgOverview />
        {teamsActive && (
          <TeamSwitcher visible={switcherVisible} onClose={() => setSwitcherVisible(false)} />
        )}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {/* Search bar */}
      <View className="px-4 pt-3 pb-2">
        <View className="flex-row items-center bg-surface border border-white/10 rounded-xl px-3 gap-2">
          <Ionicons name="search" size={16} color="#6b7280" />
          <TextInput
            className="flex-1 py-2.5 text-slate-100 text-sm"
            placeholder="Search name, category, location…"
            placeholderTextColor="#4b5563"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* Filter bar */}
      <View className="px-4 pb-2 flex-row items-center gap-2">
        <TouchableOpacity
          onPress={() => setShowBelowReserve((v) => !v)}
          className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border ${
            showBelowReserve
              ? 'bg-warning/15 border-warning/40'
              : 'bg-surface border-white/10'
          }`}
          activeOpacity={0.8}
        >
          <Ionicons
            name="alert-circle-outline"
            size={14}
            color={showBelowReserve ? '#ffd600' : '#6b7280'}
          />
          <Text className={`text-xs font-medium ${showBelowReserve ? 'text-warning' : 'text-text'}`}>
            Below reserve
          </Text>
          {belowReserveCount > 0 && (
            <View className="bg-warning/25 rounded-full px-1.5 py-0.5">
              <Text className="text-warning text-xs font-bold">{belowReserveCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        {!loading && (
          <Text className="text-text text-xs ml-auto">
            {displayItems.length} item{displayItems.length !== 1 ? 's' : ''}
          </Text>
        )}
      </View>

      {/* Error */}
      {error && (
        <View className="mx-4 mb-2 bg-danger/10 border border-danger/30 rounded-lg px-4 py-3">
          <Text className="text-danger text-sm">{error}</Text>
        </View>
      )}

      {loading && !refreshing ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#4debf9" size="large" />
        </View>
      ) : (
        <FlatList
          data={displayItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: canManage ? 96 : 24 }}
          ItemSeparatorComponent={() => <View className="h-2.5" />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#4debf9" />
          }
          ListEmptyComponent={
            <View className="items-center justify-center pt-20">
              <Ionicons name="cube-outline" size={40} color="#374151" />
              <Text className="text-text mt-3 text-sm">
                {showBelowReserve
                  ? 'No items below reserve'
                  : searchQuery
                  ? 'No items match your search'
                  : 'No equipment in this team'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <EquipmentCard
              item={item}
              onPress={() => navigation.navigate('ItemDetail', { item })}
            />
          )}
        />
      )}

      {/* FAB — dept_head / admin / owner only */}
      {canManage && (
        <TouchableOpacity
          className="absolute bottom-6 right-5 bg-accent w-14 h-14 rounded-full items-center justify-center shadow-lg"
          onPress={() => navigation.navigate('ItemForm', { mode: 'add' })}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={28} color="#0f1117" />
        </TouchableOpacity>
      )}

      {teamsActive && (
        <TeamSwitcher visible={switcherVisible} onClose={() => setSwitcherVisible(false)} />
      )}
    </View>
  );
}

// ─── Equipment card ───────────────────────────────────────────────────────────

function EquipmentCard({ item, onPress }: { item: EquipmentItem; onPress: () => void }) {
  const qty = getQty(item);
  const qtyCol = qtyColor(item);
  const statusCol = statusColor(item.status);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      className="bg-surface border border-white/10 rounded-xl p-4"
    >
      <View className="flex-row items-start justify-between gap-2">
        <Text className="text-accent font-semibold text-base flex-1" numberOfLines={2}>
          {item.name}
        </Text>
        <View className="flex-row items-center gap-1.5 mt-0.5">
          <View style={{ backgroundColor: statusCol }} className="w-2 h-2 rounded-full" />
          <Text style={{ color: statusCol }} className="text-xs font-medium">
            {item.status ?? '—'}
          </Text>
        </View>
      </View>

      <View className="flex-row flex-wrap gap-x-4 gap-y-1 mt-2.5">
        <MetaField label="Category" value={item.category} />
        <MetaField label="Location" value={item.location} />
        <MetaField label="Source" value={item.source} />
        <View className="flex-row items-center gap-1">
          <Text className="text-text text-xs">Qty:</Text>
          <Text style={{ color: qtyCol }} className="text-xs font-semibold">{qty}</Text>
          {item.reserve_min > 0 && (
            <Text className="text-text text-xs">/ {item.reserve_min} min</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function MetaField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View className="flex-row items-center gap-1">
      <Text className="text-text text-xs">{label}:</Text>
      <Text className="text-slate-300 text-xs">{value}</Text>
    </View>
  );
}
