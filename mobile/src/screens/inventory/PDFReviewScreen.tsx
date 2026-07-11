import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { InventoryStackParamList, ParsedPDFItem } from '../../lib/types';
import { useEquipmentMutations } from '../../hooks/useEquipmentMutations';
import { useSyncContext } from '../../context/SyncContext';

type Props = NativeStackScreenProps<InventoryStackParamList, 'PDFReview'>;

export default function PDFReviewScreen({ navigation, route }: Props) {
  const [items, setItems] = useState<ParsedPDFItem[]>(route.params.parsedItems);
  const [assignLocation, setAssignLocation] = useState('');
  const [committing, setCommitting] = useState(false);

  const { addMultipleItems } = useEquipmentMutations();
  const { isOnline } = useSyncContext();

  function updateItem(id: string, patch: Partial<ParsedPDFItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function deleteItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function applyLocationToAll() {
    const loc = assignLocation.trim();
    if (!loc) return;
    setItems((prev) => prev.map((i) => ({ ...i, location: loc })));
  }

  async function handleConfirm() {
    if (!isOnline) {
      Alert.alert('Offline', 'PDF import requires a connection. Please reconnect and try again.');
      return;
    }
    if (items.length === 0) {
      Alert.alert('No Items', 'There are no items to import.');
      return;
    }

    setCommitting(true);
    try {
      await addMultipleItems(items);
      const count = items.length;
      Alert.alert(
        'Imported',
        `Successfully imported ${count} item${count !== 1 ? 's' : ''}.`,
        [{ text: 'OK', onPress: () => navigation.navigate('InventoryList') }]
      );
    } catch (e: any) {
      Alert.alert('Import Failed', e.message ?? 'An error occurred during import.');
      setCommitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      className="bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Assign-all location bar */}
      <View className="px-4 pt-3 pb-3 border-b border-white/10">
        <Text className="text-slate-400 text-xs mb-1.5">Assign all to location</Text>
        <View className="flex-row gap-2">
          <TextInput
 className="flex-1 bg-surface border border-white/10 rounded-lg px-3 py-2 text-slate-100"
            style={{ fontSize: 14 }}
            placeholder="Location name…"
            placeholderTextColor="#4b5563"
            value={assignLocation}
            onChangeText={setAssignLocation}
            autoCorrect={false}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={applyLocationToAll}
          />
          <TouchableOpacity
            onPress={applyLocationToAll}
            disabled={!assignLocation.trim()}
            className="bg-accent/15 border border-accent/30 rounded-lg px-4 items-center justify-center"
            activeOpacity={0.7}
          >
            <Text className="text-accent text-sm font-medium">Apply</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-slate-500 text-xs mt-2">
          {items.length} item{items.length !== 1 ? 's' : ''}
        </Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 108 }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <ParsedItemRow
            item={item}
            onChange={(patch) => updateItem(item.id, patch)}
            onDelete={() => deleteItem(item.id)}
          />
        )}
        ListEmptyComponent={
          <View className="items-center pt-20">
            <Ionicons name="document-outline" size={40} color="#374151" />
            <Text className="text-text mt-3 text-sm">No items to review</Text>
          </View>
        }
      />

      {/* Confirm footer */}
      <View className="absolute bottom-0 left-0 right-0 px-4 pb-8 pt-3 bg-background border-t border-white/10">
        <TouchableOpacity
          onPress={handleConfirm}
          disabled={committing || items.length === 0}
          className={`rounded-xl py-3.5 items-center justify-center ${
            committing || items.length === 0 ? 'bg-accent/40' : 'bg-accent'
          }`}
          activeOpacity={0.85}
        >
          {committing ? (
            <ActivityIndicator color="#0f1117" size="small" />
          ) : (
            <Text className="text-background font-semibold text-base">
              Import {items.length} Item{items.length !== 1 ? 's' : ''}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

interface RowProps {
  item: ParsedPDFItem;
  onChange: (patch: Partial<ParsedPDFItem>) => void;
  onDelete: () => void;
}

function ParsedItemRow({ item, onChange, onDelete }: RowProps) {
  return (
    <View className="bg-surface border border-white/10 rounded-xl p-3 gap-2.5">
      {/* Name row */}
      <View className="flex-row items-center gap-2">
        <TextInput
 className="flex-1 text-accent font-semibold"
          style={{ fontSize: 14 }}
          value={item.name}
          onChangeText={(v) => onChange({ name: v })}
          placeholder="Item name"
          placeholderTextColor="#4b5563"
          returnKeyType="done"
        />
        <TouchableOpacity onPress={onDelete} hitSlop={8} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={18} color="#ef4444" />
        </TouchableOpacity>
      </View>

      {/* Category + Qty */}
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Text className="text-slate-500 text-xs mb-1">Category</Text>
          <TextInput
 className="bg-background border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-100"
            style={{ fontSize: 12 }}
            value={item.category}
            onChangeText={(v) => onChange({ category: v })}
            placeholder="—"
            placeholderTextColor="#4b5563"
            returnKeyType="done"
          />
        </View>
        <View style={{ width: 72 }}>
          <Text className="text-slate-500 text-xs mb-1">Qty</Text>
          <TextInput
 className="bg-background border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-100"
            style={{ fontSize: 12 }}
            value={String(item.quantity)}
            onChangeText={(v) => onChange({ quantity: parseInt(v, 10) || 0 })}
            keyboardType="number-pad"
            placeholder="1"
            placeholderTextColor="#4b5563"
            returnKeyType="done"
          />
        </View>
      </View>

      {/* Location + Source */}
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Text className="text-slate-500 text-xs mb-1">Location</Text>
          <TextInput
 className="bg-background border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-100"
            style={{ fontSize: 12 }}
            value={item.location}
            onChangeText={(v) => onChange({ location: v })}
            placeholder="—"
            placeholderTextColor="#4b5563"
            returnKeyType="done"
          />
        </View>
        <View className="flex-1">
          <Text className="text-slate-500 text-xs mb-1">Source</Text>
          <TextInput
 className="bg-background border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-100"
            style={{ fontSize: 12 }}
            value={item.source}
            onChangeText={(v) => onChange({ source: v })}
            placeholder="—"
            placeholderTextColor="#4b5563"
            returnKeyType="done"
          />
        </View>
      </View>
    </View>
  );
}
