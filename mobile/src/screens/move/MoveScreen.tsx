import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Modal,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useInventory } from '../../hooks/useInventory';
import { useLocations } from '../../hooks/useLocations';
import { useAuthContext } from '../../context/AuthContext';
import { useEquipmentMutations } from '../../hooks/useEquipmentMutations';
import { useSyncContext } from '../../context/SyncContext';
import { useBulkSelection } from '../../hooks/useBulkSelection';
import { moveEquipment } from '../../lib/moveEquipment';
import { EquipmentItem } from '../../lib/types';
import { getQty, statusColor } from '../../lib/helpers';
import BulkActionBar from '../../components/BulkActionBar';

export default function MoveScreen() {
  const { equipment, loading, refresh } = useInventory();
  const { locationNames } = useLocations();
  const { profile } = useAuthContext();
  const { updateItem } = useEquipmentMutations();
  const { isOnline, bumpLocalVersion } = useSyncContext();

  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Single-item move modal
  const [moveTarget, setMoveTarget] = useState<EquipmentItem | null>(null);

  // Bulk selection
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

  // ─── Filtered list ────────────────────────────────────────────────────────

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return equipment;
    return equipment.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.location ?? '').toLowerCase().includes(q) ||
        (i.category ?? '').toLowerCase().includes(q)
    );
  }, [equipment, search]);

  const filteredIds = useMemo(() => filteredItems.map((i) => i.id), [filteredItems]);
  const allSelected = filteredIds.length > 0 && selectedIds.length === filteredIds.length;

  // ─── Bulk operations ──────────────────────────────────────────────────────

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
    // Bulk delete not offered on Move tab — only move makes sense here.
    // This satisfies the BulkActionBar prop signature; the bar won't show Delete.
  }, []);

  // ─── Refresh ──────────────────────────────────────────────────────────────

  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View className="flex-1 bg-background">
      {/* Search + toolbar */}
      <View className="px-4 pt-3 pb-2">
        <View className="flex-row items-center bg-surface border border-white/10 rounded-xl px-3 gap-2">
          <Ionicons name="search" size={16} color="#6b7280" />
          <TextInput
 className="flex-1 py-2.5 text-slate-100"
            style={{ fontSize: 14 }}
            placeholder="Search equipment…"
            placeholderTextColor="#4b5563"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            editable={!bulkMode}
          />
        </View>
      </View>

      {/* Bulk / normal toolbar row */}
      <View className="px-4 pb-2 flex-row items-center gap-2">
        {bulkMode ? (
          <>
            <TouchableOpacity
              onPress={() => (allSelected ? clearSelection() : selectAllVisible(filteredIds))}
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
              {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
            </Text>
          </>
        ) : (
          <>
            <Text className="text-text text-xs">
              {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
            </Text>
            {!loading && filteredItems.length > 0 && (
              <TouchableOpacity
                onPress={() => enterBulkMode()}
                className="flex-row items-center gap-1 px-3 py-1.5 rounded-full border border-white/10 bg-surface ml-auto"
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-done-outline" size={14} color="#6b7280" />
                <Text className="text-text text-xs font-medium">Select</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {/* Cancel bar — shown at top when in bulk mode */}
      {bulkMode && (
        <View className="flex-row items-center justify-between px-4 py-2 border-b border-white/5">
          <Text className="text-slate-100 font-medium">
            {selectedIds.length > 0
              ? `${selectedIds.length} selected`
              : 'Tap items to select'}
          </Text>
          <TouchableOpacity onPress={exitBulkMode} hitSlop={8}>
            <Text style={{ color: '#4debf9', fontSize: 15 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Item list */}
      {loading && !refreshing ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#4debf9" size="large" />
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: bulkMode ? 120 : 24,
          }}
          ItemSeparatorComponent={() => <View className="h-2.5" />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#4debf9" />
          }
          ListEmptyComponent={
            <View className="items-center justify-center pt-20">
              <Ionicons name="swap-horizontal-outline" size={40} color="#374151" />
              <Text className="text-text mt-3 text-sm">
                {search ? 'No items match your search' : 'No equipment found'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <MoveItemCard
              item={item}
              bulkMode={bulkMode}
              selected={isSelected(item.id)}
              onPress={() => {
                if (bulkMode) {
                  toggleSelected(item.id);
                } else {
                  setMoveTarget(item);
                }
              }}
              onLongPress={() => {
                if (!bulkMode) enterBulkMode(item.id);
              }}
            />
          )}
        />
      )}

      {/* Bulk action bar — Move only (no delete on Move tab) */}
      {bulkMode && (
        <BulkActionBar
          selectedCount={selectedIds.length}
          locationNames={locationNames}
          onMove={handleBulkMove}
          onDelete={handleBulkDelete}
          hideDelete
        />
      )}

      {/* Single-item move modal */}
      <MoveItemModal
        item={moveTarget}
        locationNames={locationNames}
        allItems={equipment}
        profile={profile}
        isOnline={isOnline}
        bumpLocalVersion={bumpLocalVersion}
        onClose={() => setMoveTarget(null)}
      />
    </View>
  );
}

// ─── Item card ────────────────────────────────────────────────────────────────

interface MoveItemCardProps {
  item: EquipmentItem;
  bulkMode: boolean;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

function MoveItemCard({ item, bulkMode, selected, onPress, onLongPress }: MoveItemCardProps) {
  const qty = getQty(item);
  const statusCol = statusColor(item.status);

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      activeOpacity={0.75}
      className={`bg-surface border rounded-xl px-4 py-3.5 flex-row items-center gap-3 ${
        selected ? 'border-accent/50' : 'border-white/10'
      }`}
      style={selected ? { backgroundColor: 'rgba(77,235,249,0.06)' } : undefined}
    >
      {/* Checkbox */}
      {bulkMode && (
        <View
          className={`w-6 h-6 rounded-full items-center justify-center border-2 ${
            selected ? 'bg-accent border-accent' : 'border-white/25'
          }`}
        >
          {selected && <Ionicons name="checkmark" size={14} color="#0f1117" />}
        </View>
      )}

      {/* Info */}
      <View className="flex-1 min-w-0">
        <Text className="text-slate-100 font-medium text-sm" numberOfLines={1}>
          {item.name}
        </Text>
        <Text className="text-text text-xs mt-0.5">
          {item.location ?? '—'}  ·  Qty: {qty}
        </Text>
      </View>

      {/* Status dot */}
      <View className="flex-row items-center gap-1.5">
        <View style={{ backgroundColor: statusCol }} className="w-2 h-2 rounded-full" />
        <Text style={{ color: statusCol }} className="text-xs">
          {item.status}
        </Text>
      </View>

      {/* Chevron — only in normal mode */}
      {!bulkMode && (
        <Ionicons name="chevron-forward" size={16} color="#374151" />
      )}
    </TouchableOpacity>
  );
}

// ─── Single-item move modal ───────────────────────────────────────────────────

interface MoveItemModalProps {
  item: EquipmentItem | null;
  locationNames: string[];
  allItems: EquipmentItem[];
  profile: any;
  isOnline: boolean;
  bumpLocalVersion: () => void;
  onClose: () => void;
}

function MoveItemModal({
  item,
  locationNames,
  allItems,
  profile,
  isOnline,
  bumpLocalVersion,
  onClose,
}: MoveItemModalProps) {
  const [qtyInput, setQtyInput] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [locationSearch, setLocationSearch] = useState('');
  const [showLocPicker, setShowLocPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const maxQty = item ? getQty(item) : 0;

  // Reset form when item changes
  React.useEffect(() => {
    if (item) {
      setQtyInput(String(getQty(item)));
      setToLocation('');
      setLocationSearch('');
      setShowLocPicker(false);
    }
  }, [item?.id]);

  const filteredLocations = useMemo(() => {
    const q = locationSearch.trim().toLowerCase();
    const all = locationNames.filter((l) => l !== item?.location);
    if (!q) return all;
    return all.filter((l) => l.toLowerCase().includes(q));
  }, [locationNames, locationSearch, item?.location]);

  async function handleMove() {
    if (!item || !toLocation) return;

    const qty = parseInt(qtyInput, 10);
    if (!qty || qty <= 0) {
      Alert.alert('Invalid quantity', 'Please enter a quantity greater than 0.');
      return;
    }
    if (qty > maxQty) {
      Alert.alert('Invalid quantity', `Only ${maxQty} available to move.`);
      return;
    }

    setSubmitting(true);
    const result = await moveEquipment({
      sourceItem: item,
      moveQty: qty,
      toLocation,
      allItems,
      userId: profile?.id ?? '',
      updatedBy: profile?.email ?? 'unknown',
      isOnline,
    });
    setSubmitting(false);

    if (result.success) {
      bumpLocalVersion();
      onClose();
      const suffix = isOnline ? '' : ' (will sync when reconnected)';
      Alert.alert('Done', `Moved ${qty}× ${item.name} to ${toLocation}.${suffix}`);
    } else {
      Alert.alert('Move failed', result.error ?? 'Something went wrong.');
    }
  }

  return (
    <Modal visible={!!item} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/60" onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View className="bg-surface rounded-t-3xl border-t border-white/10">
          {/* Handle */}
          <View className="items-center pt-3 pb-1">
            <View className="w-10 h-1 bg-white/20 rounded-full" />
          </View>

          {showLocPicker ? (
            /* ── Inline location picker ── */
            <>
              <View className="px-5 pt-3 pb-2 flex-row items-center gap-3">
                <TouchableOpacity onPress={() => { setShowLocPicker(false); setLocationSearch(''); }} hitSlop={8}>
                  <Ionicons name="arrow-back" size={22} color="#4debf9" />
                </TouchableOpacity>
                <Text className="text-slate-100 text-lg font-semibold">Select Location</Text>
              </View>
              <View className="px-5 pb-2">
                <View className="flex-row items-center bg-background border border-white/10 rounded-xl px-3 gap-2">
                  <Ionicons name="search" size={14} color="#6b7280" />
                  <TextInput
 className="flex-1 py-2.5 text-slate-100"
                    style={{ fontSize: 14 }}
                    placeholder="Search locations…"
                    placeholderTextColor="#4b5563"
                    value={locationSearch}
                    onChangeText={setLocationSearch}
                    autoCorrect={false}
                    autoFocus
                  />
                </View>
              </View>
              <FlatList
                data={filteredLocations}
                keyExtractor={(l) => l}
                style={{ maxHeight: 320 }}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
                ItemSeparatorComponent={() => <View className="h-px bg-white/5" />}
                ListEmptyComponent={
                  <Text className="text-text text-sm text-center py-8">No locations found</Text>
                }
                renderItem={({ item: loc }) => (
                  <TouchableOpacity
                    className="flex-row items-center justify-between py-3.5"
                    onPress={() => {
                      setToLocation(loc);
                      setShowLocPicker(false);
                      setLocationSearch('');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text className={`text-base ${toLocation === loc ? 'text-accent font-medium' : 'text-slate-100'}`}>
                      {loc}
                    </Text>
                    {toLocation === loc && <Ionicons name="checkmark" size={20} color="#4debf9" />}
                  </TouchableOpacity>
                )}
              />
            </>
          ) : (
            /* ── Move form ── */
            <>
              <View className="px-5 pt-3 pb-4 flex-row items-start justify-between">
                <View className="flex-1 mr-3">
                  <Text className="text-slate-100 text-lg font-semibold" numberOfLines={2}>
                    {item?.name}
                  </Text>
                  <Text className="text-text text-sm mt-0.5">
                    From: {item?.location ?? '—'}  ·  {maxQty} available
                  </Text>
                </View>
                <TouchableOpacity onPress={onClose} hitSlop={8}>
                  <Ionicons name="close" size={22} color="#6b7280" />
                </TouchableOpacity>
              </View>

              <View className="px-5 pb-8">
                <Text className="text-text text-sm mb-1.5">Quantity</Text>
                <View className="bg-background border border-white/10 rounded-xl px-4 mb-4">
                  <TextInput
 className="py-3.5 text-slate-100"
                    style={{ fontSize: 16 }}
                    keyboardType="number-pad"
                    placeholder={`Max ${maxQty}`}
                    placeholderTextColor="#4b5563"
                    value={qtyInput}
                    onChangeText={setQtyInput}
                    returnKeyType="done"
                  />
                </View>

                <Text className="text-text text-sm mb-1.5">Destination</Text>
                <TouchableOpacity
                  className="bg-background border border-white/10 rounded-xl px-4 py-3.5 flex-row items-center justify-between mb-6"
                  onPress={() => setShowLocPicker(true)}
                  activeOpacity={0.8}
                >
                  <Text className="text-base" style={{ color: toLocation ? '#f1f5f9' : '#4b5563' }}>
                    {toLocation || 'Select location…'}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color="#6b7280" />
                </TouchableOpacity>

                <TouchableOpacity
                  className={`rounded-xl py-4 items-center ${!toLocation || submitting ? 'bg-accent/40' : 'bg-accent'}`}
                  onPress={handleMove}
                  disabled={!toLocation || submitting}
                  activeOpacity={0.85}
                >
                  {submitting ? (
                    <ActivityIndicator color="#0f1117" />
                  ) : (
                    <Text className="text-slate-900 font-semibold text-base">Move equipment</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
