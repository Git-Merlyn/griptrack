import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  Pressable,
  ActivityIndicator,
  Animated,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface BulkActionBarProps {
  selectedCount: number;
  locationNames: string[];
  onMove: (location: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

// ─── Location picker sheet ────────────────────────────────────────────────────

function LocationPickerSheet({
  visible,
  locationNames,
  selectedCount,
  onClose,
  onApply,
}: {
  visible: boolean;
  locationNames: string[];
  selectedCount: number;
  onClose: () => void;
  onApply: (location: string) => Promise<void>;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  // Reset pick when sheet opens
  useEffect(() => {
    if (visible) setPicked(null);
  }, [visible]);

  async function handleApply() {
    if (!picked) return;
    setApplying(true);
    try {
      await onApply(picked);
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to move items.');
    } finally {
      setApplying(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/60" onPress={onClose} />
      <View className="bg-surface rounded-t-3xl border-t border-white/10">
        {/* Handle */}
        <View className="items-center pt-3 pb-1">
          <View className="w-10 h-1 bg-white/20 rounded-full" />
        </View>

        {/* Header */}
        <View className="px-5 pt-3 pb-3 flex-row items-center justify-between border-b border-white/5">
          <Text className="text-slate-100 text-lg font-semibold">Move to location</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color="#6b7280" />
          </TouchableOpacity>
        </View>

        {/* Location list */}
        <FlatList
          data={locationNames}
          keyExtractor={(l) => l}
          style={{ maxHeight: 280 }}
          contentContainerStyle={{ paddingVertical: 8 }}
          ListEmptyComponent={
            <Text className="text-text text-sm text-center py-8">No locations set up yet</Text>
          }
          renderItem={({ item }) => {
            const isSelected = item === picked;
            return (
              <TouchableOpacity
                onPress={() => setPicked(item)}
                activeOpacity={0.7}
                className={`flex-row items-center justify-between mx-4 my-1 px-4 py-3 rounded-xl ${
                  isSelected ? 'bg-accent/15 border border-accent/30' : 'border border-white/5'
                }`}
              >
                <Text
                  className="text-base font-medium"
                  style={{ color: isSelected ? '#4debf9' : '#f1f5f9' }}
                >
                  {item}
                </Text>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={20} color="#4debf9" />
                )}
              </TouchableOpacity>
            );
          }}
        />

        {/* Apply button */}
        <View className="px-5 pt-3 pb-8">
          <TouchableOpacity
            className={`rounded-xl py-4 items-center ${
              !picked || applying ? 'bg-accent/30' : 'bg-accent'
            }`}
            onPress={handleApply}
            disabled={!picked || applying}
            activeOpacity={0.85}
          >
            {applying ? (
              <ActivityIndicator color="#0f1117" />
            ) : (
              <Text className="text-slate-900 font-semibold text-base">
                {picked
                  ? `Move ${selectedCount} item${selectedCount !== 1 ? 's' : ''} to ${picked}`
                  : 'Select a location'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Bar ──────────────────────────────────────────────────────────────────────

export default function BulkActionBar({
  selectedCount,
  locationNames,
  onMove,
  onDelete,
}: BulkActionBarProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [moveSheetVisible, setMoveSheetVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const visible = selectedCount > 0;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      bounciness: 4,
      speed: 18,
    }).start();
  }, [visible]);

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [120, 0],
  });

  function confirmDelete() {
    Alert.alert(
      'Delete items',
      `Permanently delete ${selectedCount} item${selectedCount !== 1 ? 's' : ''}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await onDelete();
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'Failed to delete items.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  }

  // Always render so the slide animation can play out; pointer events handled by opacity
  return (
    <>
      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        style={{
          transform: [{ translateY }],
          position: 'absolute',
          left: 0,
          right: 0,
          // Sit just above the tab bar (tab bar height ≈ 49 + bottom safe area)
          bottom: 49 + insets.bottom,
        }}
      >
        <View
          className="mx-4 mb-2 bg-surface border border-white/15 rounded-2xl px-4 py-3 flex-row items-center gap-3"
          style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
          {/* Count */}
          <Text className="text-slate-100 font-semibold flex-1">
            {selectedCount} selected
          </Text>

          {/* Delete */}
          <TouchableOpacity
            onPress={confirmDelete}
            disabled={deleting}
            className="flex-row items-center gap-1.5 border border-danger/30 rounded-xl px-3 py-2"
            activeOpacity={0.8}
          >
            {deleting ? (
              <ActivityIndicator size="small" color="#ff4d4d" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={16} color="#ff4d4d" />
                <Text className="text-danger text-sm font-medium">Delete</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Move */}
          <TouchableOpacity
            onPress={() => setMoveSheetVisible(true)}
            className="flex-row items-center gap-1.5 bg-accent/15 border border-accent/30 rounded-xl px-3 py-2"
            activeOpacity={0.8}
          >
            <Ionicons name="swap-horizontal-outline" size={16} color="#4debf9" />
            <Text className="text-accent text-sm font-medium">Move</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      <LocationPickerSheet
        visible={moveSheetVisible}
        locationNames={locationNames}
        selectedCount={selectedCount}
        onClose={() => setMoveSheetVisible(false)}
        onApply={onMove}
      />
    </>
  );
}
