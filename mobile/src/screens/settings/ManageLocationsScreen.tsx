import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Location } from '../../lib/types';
import { getAllLocationsByOrg } from '../../lib/db';
import { useLocationMutations } from '../../hooks/useLocationMutations';
import { useAuthContext } from '../../context/AuthContext';
import { useSyncContext } from '../../context/SyncContext';
import ToggleSwitch from '../../components/ToggleSwitch';

export default function ManageLocationsScreen() {
  const { profile } = useAuthContext();
  const { localVersion } = useSyncContext();
  const { addLocation, renameLocation, toggleLocation, deleteLocation } = useLocationMutations();

  const [locations, setLocations] = useState<Location[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Add / rename modal
  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<Location | null>(null); // null = add mode
  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!profile?.org_id) return;
    setLocations(getAllLocationsByOrg(profile.org_id));
  }, [profile?.org_id]);

  useEffect(() => { load(); }, [load, localVersion]);

  async function handleRefresh() {
    setRefreshing(true);
    load();
    setRefreshing(false);
  }

  function openAdd() {
    setEditTarget(null);
    setNameInput('');
    setModalVisible(true);
  }

  function openRename(loc: Location) {
    setEditTarget(loc);
    setNameInput(loc.name);
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setNameInput('');
    setEditTarget(null);
  }

  async function handleSave() {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      Alert.alert('Required', 'Please enter a location name.');
      return;
    }
    // Prevent duplicates (case-insensitive)
    const duplicate = locations.some(
      (l) =>
        l.name.toLowerCase() === trimmed.toLowerCase() &&
        l.id !== editTarget?.id
    );
    if (duplicate) {
      Alert.alert('Already exists', `A location named "${trimmed}" already exists.`);
      return;
    }

    setSaving(true);
    try {
      if (editTarget) {
        await renameLocation(editTarget.id, trimmed);
      } else {
        await addLocation(trimmed);
      }
      closeModal();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to save location.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(loc: Location, isActive: boolean) {
    // Optimistic update
    setLocations((prev) =>
      prev.map((l) => (l.id === loc.id ? { ...l, is_active: isActive } : l))
    );
    try {
      await toggleLocation(loc.id, isActive);
    } catch (err: any) {
      // Revert
      setLocations((prev) =>
        prev.map((l) => (l.id === loc.id ? { ...l, is_active: !isActive } : l))
      );
      Alert.alert('Error', err?.message ?? 'Failed to update location.');
    }
  }

  function confirmDelete(loc: Location) {
    Alert.alert(
      'Delete location',
      `Delete "${loc.name}"? Equipment assigned here won't move automatically.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteLocation(loc.id);
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'Failed to delete location.');
            }
          },
        },
      ]
    );
  }

  return (
    <View className="flex-1 bg-background">
      {locations.length === 0 && !refreshing ? (
        <View className="flex-1 items-center justify-center">
          <Ionicons name="location-outline" size={40} color="#374151" />
          <Text className="text-text mt-3 text-sm">No locations yet</Text>
          <TouchableOpacity
            onPress={openAdd}
            className="mt-4 bg-accent rounded-xl px-5 py-2.5"
            activeOpacity={0.85}
          >
            <Text className="text-slate-900 font-semibold">Add first location</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={locations}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          ItemSeparatorComponent={() => <View className="h-2.5" />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#4debf9" />
          }
          ListHeaderComponent={
            <Text className="text-text text-xs mb-4">
              {locations.length} location{locations.length !== 1 ? 's' : ''}
            </Text>
          }
          renderItem={({ item: loc }) => (
            <View
              className={`bg-surface border rounded-xl px-4 py-3.5 flex-row items-center gap-3 ${
                loc.is_active ? 'border-white/10' : 'border-white/5 opacity-50'
              }`}
            >
              <Ionicons name="location-outline" size={18} color="#6b7280" />

              <Text className="text-slate-100 font-medium flex-1" numberOfLines={1}>
                {loc.name}
              </Text>

              {/* Rename */}
              <TouchableOpacity
                onPress={() => openRename(loc)}
                hitSlop={8}
                className="p-1"
              >
                <Ionicons name="pencil-outline" size={16} color="#6b7280" />
              </TouchableOpacity>

              {/* Active toggle */}
              <ToggleSwitch
                value={loc.is_active}
                onValueChange={(v) => handleToggle(loc, v)}
              />

              {/* Delete */}
              <TouchableOpacity
                onPress={() => confirmDelete(loc)}
                hitSlop={8}
                className="p-1"
              >
                <Ionicons name="trash-outline" size={16} color="#ff4d4d" />
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        className="absolute bottom-6 right-5 bg-accent w-14 h-14 rounded-full items-center justify-center shadow-lg"
        onPress={openAdd}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#0f1117" />
      </TouchableOpacity>

      {/* Add / rename modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <Pressable className="flex-1 bg-black/60" onPress={closeModal} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View className="bg-surface rounded-t-3xl border-t border-white/10">
            <View className="items-center pt-3 pb-1">
              <View className="w-10 h-1 bg-white/20 rounded-full" />
            </View>

            <View className="px-5 pt-3 pb-2 flex-row items-center justify-between">
              <Text className="text-slate-100 text-lg font-semibold">
                {editTarget ? 'Rename location' : 'New location'}
              </Text>
              <TouchableOpacity onPress={closeModal} hitSlop={8}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 20, paddingBottom: 40 }}>
              <TextInput
                className="bg-background border border-white/10 rounded-xl px-4 py-3.5 text-slate-100 mb-5"
                style={{ fontSize: 16 }}
                placeholder="e.g. G&E Truck, Stage A…"
                placeholderTextColor="#4b5563"
                value={nameInput}
                onChangeText={setNameInput}
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={handleSave}
                autoFocus
              />
              <TouchableOpacity
                className={`rounded-xl py-4 items-center ${saving ? 'bg-accent/40' : 'bg-accent'}`}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color="#0f1117" />
                ) : (
                  <Text className="text-slate-900 font-semibold text-base">
                    {editTarget ? 'Save changes' : 'Add location'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
