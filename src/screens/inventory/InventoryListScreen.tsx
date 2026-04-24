import React, { useLayoutEffect, useState } from 'react';
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

import { InventoryStackParamList, EquipmentItem } from '../../lib/types';
import { useInventory } from '../../hooks/useInventory';
import { useTeamContext } from '../../context/TeamContext';
import TeamSwitcher from '../../components/TeamSwitcher';
import { statusColor, getQty, qtyColor } from '../../lib/helpers';

type Props = NativeStackScreenProps<InventoryStackParamList, 'InventoryList'>;

export default function InventoryListScreen({ navigation }: Props) {
  const { filteredEquipment, loading, error, searchQuery, setSearchQuery, refresh } =
    useInventory();
  const { activeTeam, canSwitch } = useTeamContext();
  const [switcherVisible, setSwitcherVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Header: show team name always; add switcher button only for admin/owner
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        canSwitch ? (
          <TouchableOpacity
            onPress={() => setSwitcherVisible(true)}
            className="flex-row items-center gap-1.5 mr-1"
            hitSlop={8}
          >
            <Ionicons name="people-outline" size={16} color="#4debf9" />
            <Text className="text-accent text-sm font-medium" numberOfLines={1}>
              {activeTeam?.name ?? 'All Teams'}
            </Text>
            <Ionicons name="chevron-down" size={14} color="#4debf9" />
          </TouchableOpacity>
        ) : (
          // Non-admins see their team name as a static label
          <View className="flex-row items-center gap-1.5 mr-1">
            <Ionicons name="people-outline" size={16} color="#6b7280" />
            <Text className="text-text text-sm" numberOfLines={1}>
              {activeTeam?.name ?? ''}
            </Text>
          </View>
        ),
    });
  }, [navigation, activeTeam, canSwitch]);

  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  function handleItemPress(item: EquipmentItem) {
    navigation.navigate('ItemDetail', { item });
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

      {/* Result count */}
      {!loading && (
        <View className="px-4 pb-1">
          <Text className="text-text text-xs">
            {filteredEquipment.length} item{filteredEquipment.length !== 1 ? 's' : ''}
          </Text>
        </View>
      )}

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
          data={filteredEquipment}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          ItemSeparatorComponent={() => <View className="h-2.5" />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#4debf9"
            />
          }
          ListEmptyComponent={
            <View className="items-center justify-center pt-20">
              <Ionicons name="cube-outline" size={40} color="#374151" />
              <Text className="text-text mt-3 text-sm">
                {searchQuery ? 'No items match your search' : 'No equipment in this team'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <EquipmentCard item={item} onPress={() => handleItemPress(item)} />
          )}
        />
      )}

      {canSwitch && (
        <TeamSwitcher
          visible={switcherVisible}
          onClose={() => setSwitcherVisible(false)}
        />
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
