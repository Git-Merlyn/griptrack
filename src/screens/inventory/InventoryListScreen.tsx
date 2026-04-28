import React, { useLayoutEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { InventoryStackParamList, EquipmentItem, canManageInventory } from '../../lib/types';
import { useInventory } from '../../hooks/useInventory';
import { useEquipmentMutations } from '../../hooks/useEquipmentMutations';
import { useLocations } from '../../hooks/useLocations';
import { useTeamContext } from '../../context/TeamContext';
import { useAuthContext } from '../../context/AuthContext';
import { useBulkSelection } from '../../hooks/useBulkSelection';
import TeamSwitcher from '../../components/TeamSwitcher';
import OrgOverview from '../../components/OrgOverview';
import BulkActionBar from '../../components/BulkActionBar';
import { useOrgContext } from '../../context/OrgContext';
import { statusColor, getQty, qtyColor } from '../../lib/helpers';

type Props = NativeStackScreenProps<InventoryStackParamList, 'InventoryList'>;

export default function InventoryListScreen({ navigation }: Props) {
  const { filteredEquipment, equipment, loading, error, searchQuery, setSearchQuery, refresh } =
    useInventory();
  const { updateItem, deleteItem } = useEquipmentMutations();
  const { locationNames } = useLocations();
  const { activeTeam, activeTeamId, canSwitch, loadingTeams } = useTeamContext();
  const { profile } = useAuthContext();
  const { features } = useOrgContext();

  const teamsActive = canSwitch && features.teamsEnabled;
  const canManage = profile?.role != null && canManageInventory(profile.role);

  const [switcherVisible, setSwitcherVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showBelowReserve, setShowBelowReserve] = useState(false);

  // ─── Bulk selection ─────────────────────────────────────────────────────────
  const {
    bulkMode,
    selectedIds,
    enterBulkMode,
    exitBulkMode,
    isSelected,
    toggleSelected,
    selectAllVisible,
    clearSelection,
  } = useBulkSelection();

  // ─── Filtered display items ──────────────────────────────────────────────────
  const displayItems = useMemo(() => {
    if (!showBelowReserve) return filteredEquipment;
    return filteredEquipment.filter((item) => {
      const qty = getQty(item);
      const reserve = Number(item.reserve_min) || 0;
      return reserve > 0 && qty < reserve;
    });
  }, [filteredEquipment, showBelowReserve]);

  const belowReserveCount = useMemo(
    () =>
      equipment.filter((i) => {
        const qty = getQty(i);
        const r = Number(i.reserve_min) || 0;
        return r > 0 && qty < r;
      }).length,
    [equipment]
  );

  const displayItemIds = useMemo(() => displayItems.map((i) => i.id), [displayItems]);
  const allSelected = displayItemIds.length > 0 && selectedIds.length === displayItemIds.length;

  const showOrgOverview = teamsActive && !activeTeamId && !loadingTeams;

  // ─── Bulk operations ─────────────────────────────────────────────────────────

  const handleBulkMove = useCallback(
    async (location: string) => {
      for (const id of selectedIds) {
        await updateItem(id, { location });
      }
      exitBulkMode();
    },
    [selectedIds, updateItem, exitBulkMode]
  );

  const handleBulkDelete = useCallback(async () => {
    for (const id of selectedIds) {
      await deleteItem(id);
    }
    exitBulkMode();
  }, [selectedIds, deleteItem, exitBulkMode]);

  // ─── Header ──────────────────────────────────────────────────────────────────

  useLayoutEffect(() => {
    if (bulkMode) {
      navigation.setOptions({
        headerTitle: selectedIds.length > 0
          ? `${selectedIds.length} selected`
          : 'Select items',
        headerBackVisible: false,
        headerLeft: () => (
          <TouchableOpacity onPress={exitBulkMode} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ color: '#4debf9', fontSize: 16, fontWeight: '400' }}>Cancel</Text>
          </TouchableOpacity>
        ),
        headerRight: () => null,
      });
    } else {
      navigation.setOptions({
        headerTitle: 'Inventory',
        headerBackVisible: true,
        headerLeft: undefined,
        headerRight: () =>
          teamsActive && activeTeam ? (
            <TouchableOpacity
              onPress={() => setSwitcherVisible(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 4 }}
              hitSlop={8}
            >
              <Ionicons name="people-outline" size={16} color="#4debf9" />
              <Text style={{ color: '#4debf9', fontSize: 14, fontWeight: '500' }} numberOfLines={1}>
                {activeTeam.name}
              </Text>
              <Ionicons name="chevron-down" size={14} color="#4debf9" />
            </TouchableOpacity>
          ) : undefined,
      });
    }
  }, [navigation, bulkMode, selectedIds.length, teamsActive, activeTeam, exitBulkMode]);

  // ─── Actions ─────────────────────────────────────────────────────────────────

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
            editable={!bulkMode}
          />
        </View>
      </View>

      {/* Filter / bulk toolbar */}
      <View className="px-4 pb-2 flex-row items-center gap-2">
        {bulkMode ? (
          /* Bulk mode: select-all toggle + count */
          <>
            <TouchableOpacity
              onPress={() =>
                allSelected ? clearSelection() : selectAllVisible(displayItemIds)
              }
              className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border ${
                allSelected ? 'bg-accent/15 border-accent/30' : 'bg-surface border-white/10'
              }`}
              activeOpacity={0.8}
            >
              <Ionicons
                name={allSelected ? 'checkmark-circle' : 'ellipse-outline'}
                size={14}
                color={allSelected ? '#4debf9' : '#6b7280'}
              />
              <Text className={`text-xs font-medium ${allSelected ? 'text-accent' : 'text-text'}`}>
                {allSelected ? 'Deselect all' : 'Select all'}
              </Text>
            </TouchableOpacity>
            <Text className="text-text text-xs ml-auto">
              {displayItems.length} item{displayItems.length !== 1 ? 's' : ''}
            </Text>
          </>
        ) : (
          /* Normal mode: below-reserve filter + multi-select entry */
          <>
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

            {/* Multi-select entry — canManage only */}
            {canManage && !loading && displayItems.length > 0 && (
              <TouchableOpacity
                onPress={() => enterBulkMode()}
                className="flex-row items-center gap-1 px-3 py-1.5 rounded-full border border-white/10 bg-surface ml-auto"
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-done-outline" size={14} color="#6b7280" />
                <Text className="text-text text-xs font-medium">Select</Text>
              </TouchableOpacity>
            )}

            {!canManage && !loading && (
              <Text className="text-text text-xs ml-auto">
                {displayItems.length} item{displayItems.length !== 1 ? 's' : ''}
              </Text>
            )}
          </>
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
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: bulkMode ? 120 : (canManage ? 96 : 24),
          }}
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
              bulkMode={bulkMode}
              selected={isSelected(item.id)}
              onPress={() => {
                if (bulkMode) {
                  toggleSelected(item.id);
                } else {
                  navigation.navigate('ItemDetail', { item });
                }
              }}
              onLongPress={() => {
                if (!bulkMode && canManage) {
                  enterBulkMode(item.id);
                }
              }}
            />
          )}
        />
      )}

      {/* FAB — dept_head / admin / owner, hidden in bulk mode */}
      {canManage && !bulkMode && (
        <TouchableOpacity
          className="absolute bottom-6 right-5 bg-accent w-14 h-14 rounded-full items-center justify-center shadow-lg"
          onPress={() => navigation.navigate('ItemForm', { mode: 'add' })}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={28} color="#0f1117" />
        </TouchableOpacity>
      )}

      {/* Bulk action bar — slides up when items are selected */}
      {canManage && bulkMode && (
        <BulkActionBar
          selectedCount={selectedIds.length}
          locationNames={locationNames}
          onMove={handleBulkMove}
          onDelete={handleBulkDelete}
        />
      )}

      {teamsActive && !bulkMode && (
        <TeamSwitcher visible={switcherVisible} onClose={() => setSwitcherVisible(false)} />
      )}
    </View>
  );
}

// ─── Equipment card ───────────────────────────────────────────────────────────

interface EquipmentCardProps {
  item: EquipmentItem;
  bulkMode: boolean;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

function EquipmentCard({ item, bulkMode, selected, onPress, onLongPress }: EquipmentCardProps) {
  const qty = getQty(item);
  const qtyCol = qtyColor(item);
  const statusCol = statusColor(item.status);

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      activeOpacity={0.75}
      className={`bg-surface border rounded-xl p-4 flex-row items-center gap-3 ${
        selected ? 'border-accent/50' : 'border-white/10'
      }`}
      style={selected ? { backgroundColor: 'rgba(77,235,249,0.06)' } : undefined}
    >
      {/* Checkbox — only visible in bulk mode */}
      {bulkMode && (
        <View
          className={`w-6 h-6 rounded-full items-center justify-center border-2 ${
            selected ? 'bg-accent border-accent' : 'border-white/25'
          }`}
        >
          {selected && (
            <Ionicons name="checkmark" size={14} color="#0f1117" />
          )}
        </View>
      )}

      {/* Content */}
      <View className="flex-1">
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
