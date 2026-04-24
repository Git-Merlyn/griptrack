import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Modal,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useInventory } from '../../hooks/useInventory';
import { useLocations } from '../../hooks/useLocations';
import { useAuthContext } from '../../context/AuthContext';
import { moveEquipment } from '../../lib/moveEquipment';
import { EquipmentItem } from '../../lib/types';
import { getQty, statusColor } from '../../lib/helpers';

export default function MoveScreen() {
  const { equipment, refresh } = useInventory();
  const { locationNames } = useLocations();
  const { profile } = useAuthContext();

  // Step 1: item selection
  const [itemSearch, setItemSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<EquipmentItem | null>(null);

  // Step 2: quantity + destination
  const [qtyInput, setQtyInput] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');

  // Submission state
  const [submitting, setSubmitting] = useState(false);

  // ─── Item search ──────────────────────────────────────────────────────────

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return equipment;
    return equipment.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.location ?? '').toLowerCase().includes(q)
    );
  }, [equipment, itemSearch]);

  const filteredLocations = useMemo(() => {
    const q = locationSearch.trim().toLowerCase();
    // Exclude current location of selected item
    const all = locationNames.filter((l) => l !== selectedItem?.location);
    if (!q) return all;
    return all.filter((l) => l.toLowerCase().includes(q));
  }, [locationNames, locationSearch, selectedItem]);

  function selectItem(item: EquipmentItem) {
    setSelectedItem(item);
    setItemSearch('');
    setQtyInput(String(getQty(item))); // default to full quantity
    setToLocation('');
  }

  function clearSelection() {
    setSelectedItem(null);
    setQtyInput('');
    setToLocation('');
  }

  // ─── Submit ───────────────────────────────────────────────────────────────

  async function handleMove() {
    if (!selectedItem || !toLocation) return;

    const qty = parseInt(qtyInput, 10);
    const maxQty = getQty(selectedItem);

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
      sourceItem: selectedItem,
      moveQty: qty,
      toLocation,
      allItems: equipment,
      updatedBy: profile?.email ?? 'unknown',
    });
    setSubmitting(false);

    if (result.success) {
      await refresh();
      clearSelection();
      Alert.alert('Done', `Moved ${qty}× ${selectedItem.name} to ${toLocation}.`);
    } else {
      Alert.alert('Move failed', result.error ?? 'Something went wrong.');
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Step 1: Select item ── */}
        <SectionLabel step="1" label="Select item" />

        {selectedItem ? (
          // Selected item card
          <View className="bg-surface border border-accent/30 rounded-xl p-4 mb-4">
            <View className="flex-row items-start justify-between">
              <View className="flex-1 mr-3">
                <Text className="text-accent font-semibold text-base" numberOfLines={2}>
                  {selectedItem.name}
                </Text>
                <Text className="text-text text-sm mt-0.5">
                  {selectedItem.location}  ·  Qty: {getQty(selectedItem)}
                </Text>
              </View>
              <TouchableOpacity onPress={clearSelection} hitSlop={8}>
                <Ionicons name="close-circle" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          // Item search + list
          <View className="mb-4">
            <View className="flex-row items-center bg-surface border border-white/10 rounded-xl px-3 gap-2 mb-2">
              <Ionicons name="search" size={16} color="#6b7280" />
              <TextInput
                className="flex-1 py-2.5 text-slate-100 text-sm"
                placeholder="Search equipment…"
                placeholderTextColor="#4b5563"
                value={itemSearch}
                onChangeText={setItemSearch}
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>

            {filteredItems.slice(0, 30).map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => selectItem(item)}
                activeOpacity={0.75}
                className="bg-surface border border-white/10 rounded-xl px-4 py-3 mb-2 flex-row items-center justify-between"
              >
                <View className="flex-1 mr-3">
                  <Text className="text-slate-100 font-medium text-sm" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text className="text-text text-xs mt-0.5">
                    {item.location}  ·  Qty: {getQty(item)}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                  <View
                    style={{ backgroundColor: statusColor(item.status) }}
                    className="w-2 h-2 rounded-full"
                  />
                  <Text style={{ color: statusColor(item.status) }} className="text-xs">
                    {item.status}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Steps 2 & 3 — only shown once an item is selected ── */}
        {selectedItem && (
          <>
            {/* Step 2: Quantity */}
            <SectionLabel step="2" label="Quantity to move" />
            <View className="bg-surface border border-white/10 rounded-xl px-4 mb-4">
              <TextInput
                className="py-3.5 text-slate-100 text-base"
                keyboardType="number-pad"
                placeholder={`Max ${getQty(selectedItem)}`}
                placeholderTextColor="#4b5563"
                value={qtyInput}
                onChangeText={setQtyInput}
                returnKeyType="done"
              />
            </View>

            {/* Step 3: Destination location */}
            <SectionLabel step="3" label="Destination" />
            <TouchableOpacity
              className="bg-surface border border-white/10 rounded-xl px-4 py-3.5 flex-row items-center justify-between mb-6"
              onPress={() => setLocationPickerVisible(true)}
              activeOpacity={0.8}
            >
              <Text className={toLocation ? 'text-slate-100 text-base' : 'text-[#4b5563] text-base'}>
                {toLocation || 'Select location…'}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#6b7280" />
            </TouchableOpacity>

            {/* Move button */}
            <TouchableOpacity
              className={`rounded-xl py-4 items-center ${
                !toLocation || submitting ? 'bg-accent/40' : 'bg-accent'
              }`}
              onPress={handleMove}
              disabled={!toLocation || submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#0f1117" />
              ) : (
                <Text className="text-slate-900 font-semibold text-base">
                  Move equipment
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* ── Location picker modal ── */}
      <Modal
        visible={locationPickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setLocationPickerVisible(false)}
      >
        <Pressable
          className="flex-1 bg-black/60"
          onPress={() => setLocationPickerVisible(false)}
        />
        <View className="bg-surface rounded-t-3xl border-t border-white/10 max-h-[60%]">
          <View className="items-center pt-3 pb-1">
            <View className="w-10 h-1 bg-white/20 rounded-full" />
          </View>

          <View className="px-5 pt-3 pb-2 flex-row items-center justify-between">
            <Text className="text-slate-100 text-lg font-semibold">Select Location</Text>
            <TouchableOpacity onPress={() => setLocationPickerVisible(false)} hitSlop={8}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <View className="px-5 pb-2">
            <View className="flex-row items-center bg-background border border-white/10 rounded-xl px-3 gap-2">
              <Ionicons name="search" size={14} color="#6b7280" />
              <TextInput
                className="flex-1 py-2.5 text-slate-100 text-sm"
                placeholder="Search locations…"
                placeholderTextColor="#4b5563"
                value={locationSearch}
                onChangeText={setLocationSearch}
                autoCorrect={false}
              />
            </View>
          </View>

          <FlatList
            data={filteredLocations}
            keyExtractor={(l) => l}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
            ItemSeparatorComponent={() => <View className="h-px bg-white/5" />}
            renderItem={({ item: loc }) => (
              <TouchableOpacity
                className="flex-row items-center justify-between py-3.5"
                onPress={() => {
                  setToLocation(loc);
                  setLocationPickerVisible(false);
                  setLocationSearch('');
                }}
                activeOpacity={0.7}
              >
                <Text className={`text-base ${toLocation === loc ? 'text-accent font-medium' : 'text-slate-100'}`}>
                  {loc}
                </Text>
                {toLocation === loc && (
                  <Ionicons name="checkmark" size={20} color="#4debf9" />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function SectionLabel({ step, label }: { step: string; label: string }) {
  return (
    <View className="flex-row items-center gap-2 mb-2">
      <View className="w-5 h-5 rounded-full bg-accent/20 items-center justify-center">
        <Text className="text-accent text-xs font-bold">{step}</Text>
      </View>
      <Text className="text-text text-sm font-medium uppercase tracking-wide">{label}</Text>
    </View>
  );
}
