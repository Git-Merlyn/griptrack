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
import { useTeamContext } from '../../context/TeamContext';
import { useAuthContext } from '../../context/AuthContext';
import TeamSwitcher from '../../components/TeamSwitcher';
import OrgOverview from '../../components/OrgOverview';
import { useOrgContext } from '../../context/OrgContext';
import { useSyncContext } from '../../context/SyncContext';
import { usePDFImport } from '../../hooks/usePDFImport';
import { statusColor, getQty, qtyColor } from '../../lib/helpers';

type Props = NativeStackScreenProps<InventoryStackParamList, 'InventoryList'>;

export default function InventoryListScreen({ navigation }: Props) {
  const { filteredEquipment, equipment, loading, error, searchQuery, setSearchQuery, refresh } =
    useInventory();
  const { activeTeam, activeTeamId, canSwitch, loadingTeams } = useTeamContext();
  const { profile } = useAuthContext();
  const { features } = useOrgContext();

  const { isOnline } = useSyncContext();
  const { status: importStatus, pickAndParse } = usePDFImport();

  const teamsActive = canSwitch && features.teamsEnabled;
  const canManage = profile?.role != null && canManageInventory(profile.role);

  const [switcherVisible, setSwitcherVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showBelowReserve, setShowBelowReserve] = useState(false);

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

  const showOrgOverview = teamsActive && !activeTeamId && !loadingTeams;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginRight: 0 }}>
          {canManage && (
            <TouchableOpacity
              onPress={() =>
                Alert.alert('', '', [
                  {
                    text: 'Add Item',
                    onPress: () => navigation.navigate('ItemForm', { mode: 'add' }),
                  },
                  { text: 'Import PDF / CSV', onPress: handleImportPDF },
                  { text: 'Cancel', style: 'cancel' },
                ])
              }
              hitSlop={10}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={28} color="#4debf9" />
            </TouchableOpacity>
          )}
          {teamsActive && activeTeam && (
            <TouchableOpacity
              onPress={() => setSwitcherVisible(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              hitSlop={10}
            >
              <Ionicons name="people-outline" size={16} color="#4debf9" />
              <Text className="text-accent text-sm font-medium" numberOfLines={1}>
                {activeTeam.name}
              </Text>
              <Ionicons name="chevron-down" size={14} color="#4debf9" />
            </TouchableOpacity>
          )}
        </View>
      ),
    });
  }, [navigation, activeTeam, teamsActive, canManage, handleImportPDF]);

  const handleImportPDF = useCallback(async () => {
    if (!isOnline) {
      Alert.alert('Offline', 'PDF import requires a connection. Please reconnect and try again.');
      return;
    }
    try {
      const items = await pickAndParse();
      if (!items) return; // user cancelled
      if (items.length === 0) {
        Alert.alert('No Items Found', 'The PDF did not contain any recognizable line items.');
        return;
      }
      navigation.navigate('PDFReview', { parsedItems: items });
    } catch (e: any) {
      Alert.alert('Parse Error', e.message ?? 'Failed to parse PDF');
    }
  }, [isOnline, pickAndParse, navigation]);

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
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
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

      {/* Parsing overlay */}
      {importStatus === 'parsing' && (
        <View className="absolute inset-0 bg-black/60 items-center justify-center">
          <View className="bg-surface rounded-2xl px-8 py-6 items-center gap-3">
            <ActivityIndicator color="#4debf9" size="large" />
            <Text className="text-slate-300 text-sm">Parsing PDF…</Text>
          </View>
        </View>
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
