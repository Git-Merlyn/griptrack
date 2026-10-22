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
import { Location, canDeleteLocations } from '../../lib/types';
import { getAllLocationsByOrg } from '../../lib/db';
import { useLocationMutations } from '../../hooks/useLocationMutations';
import { useAuthContext } from '../../context/AuthContext';
import { useSyncContext } from '../../context/SyncContext';
import ToggleSwitch from '../../components/ToggleSwitch';
import IconButton from '../../components/IconButton';
import { GapSm } from '../../components/ListSeparators';

export default function ManageLocationsScreen() {
  const { profile } = useAuthContext();
  const { localVersion, triggerSync, isSyncing } = useSyncContext();
  const { addLocation, renameLocation, toggleLocation, deleteLocation } = useLocationMutations();
  // RLS lets department heads add, rename and (de)activate locations, but
  // only owner/admin may delete them — so dept heads get no trash button.
  const canDelete = profile?.role != null && canDeleteLocations(profile.role);

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

  // Pull-to-refresh runs a real sync, so a location added on the web shows
  // up. triggerSync() records its own failures in syncError (shown by the
  // sync status bar), so a rejection here is only swallowed, never unhandled.
  // load() re-reads SQLite afterwards in every case.
  async function handleRefresh() {
    setRefreshing(true);
    try {
      await triggerSync();
    } catch {
      // already surfaced through SyncContext's syncError
    } finally {
      setRefreshing(false);
      load();
    }
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
      {/* One FlatList for every state, so pull-to-refresh also works from the
          empty state. Before the first sync finishes, show a spinner rather
          than "No locations yet". */}
      <FlatList
        data={locations}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 96, flexGrow: 1 }}
        ItemSeparatorComponent={GapSm}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#4debf9" />
        }
        ListHeaderComponent={
          locations.length > 0 ? (
            <Text className="text-text text-xs mb-4">
              {locations.length} location{locations.length !== 1 ? 's' : ''}
            </Text>
          ) : undefined
        }
        ListEmptyComponent={
          isSyncing && !refreshing ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color="#4debf9" size="large" />
            </View>
          ) : (
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
          )
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
            <IconButton
              icon="pencil-outline"
              label={`Rename ${loc.name}`}
              size={16}
              className="p-1"
              onPress={() => openRename(loc)}
            />

            {/* Active toggle */}
            <ToggleSwitch
              value={loc.is_active}
              onValueChange={(v) => handleToggle(loc, v)}
              accessibilityLabel={`${loc.name} active`}
            />

            {/* Delete — owner/admin only */}
            {canDelete && (
              <IconButton
                icon="trash-outline"
                label={`Delete ${loc.name}`}
                size={16}
                color="#ff4d4d"
                className="p-1"
                onPress={() => confirmDelete(loc)}
              />
            )}
          </View>
        )}
      />

      {/* FAB */}
      <TouchableOpacity
        className="absolute bottom-6 right-5 bg-accent w-14 h-14 rounded-full items-center justify-center shadow-lg"
        onPress={openAdd}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Add location"
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
              <IconButton icon="close" label="Close" onPress={closeModal} />
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
