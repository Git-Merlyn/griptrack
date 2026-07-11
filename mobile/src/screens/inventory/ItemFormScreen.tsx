import React, { useState, useLayoutEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  FlatList,
  Pressable,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { InventoryStackParamList, CORE_STATUSES } from '../../lib/types';
import { useEquipmentMutations, ItemFields } from '../../hooks/useEquipmentMutations';
import { useLocations } from '../../hooks/useLocations';
import { useInventory } from '../../hooks/useInventory';

type Props = NativeStackScreenProps<InventoryStackParamList, 'ItemForm'>;

// ─── Inline picker modal ──────────────────────────────────────────────────────

function PickerModal({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: string[];
  value: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/60" onPress={onClose} />
      <View className="bg-surface rounded-t-3xl border-t border-white/10 max-h-[55%]">
        <View className="items-center pt-3 pb-1">
          <View className="w-10 h-1 bg-white/20 rounded-full" />
        </View>
        <View className="px-5 pt-3 pb-2 flex-row items-center justify-between">
          <Text className="text-slate-100 text-lg font-semibold">{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color="#6b7280" />
          </TouchableOpacity>
        </View>
        <FlatList
          data={options}
          keyExtractor={(o) => o}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View className="h-px bg-white/5" />}
          renderItem={({ item: opt }) => (
            <TouchableOpacity
              className="flex-row items-center justify-between py-3.5"
              onPress={() => { onSelect(opt); onClose(); }}
              activeOpacity={0.7}
            >
              <Text className={`text-base ${value === opt ? 'text-accent font-medium' : 'text-slate-100'}`}>
                {opt}
              </Text>
              {value === opt && <Ionicons name="checkmark" size={20} color="#4debf9" />}
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
}

// ─── Field components ─────────────────────────────────────────────────────────

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-4">
      <Text className="text-text text-sm mb-1.5">
        {label}
        {required && <Text className="text-danger"> *</Text>}
      </Text>
      {children}
    </View>
  );
}

function TextInputField({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'number-pad';
  autoCapitalize?: 'none' | 'words' | 'sentences';
}) {
  return (
    <TextInput
      className="bg-background border border-white/10 rounded-xl px-4 pt-3.5 pb-5 text-slate-100 text-base"
      placeholderTextColor="#4b5563"
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      keyboardType={keyboardType ?? 'default'}
      autoCapitalize={autoCapitalize ?? 'sentences'}
      autoCorrect={false}
    />
  );
}

function PickerField({
  value,
  placeholder,
  onPress,
}: {
  value: string;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      className="bg-background border border-white/10 rounded-xl px-4 py-3 flex-row items-center justify-between"
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text className={value ? 'text-slate-100 text-base' : 'text-[#4b5563] text-base'}>
        {value || placeholder}
      </Text>
      <Ionicons name="chevron-down" size={16} color="#6b7280" />
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ItemFormScreen({ route, navigation }: Props) {
  const { mode } = route.params;
  const existingItem = mode === 'edit' ? route.params.item : null;

  const { addItem, updateItem } = useEquipmentMutations();
  const { locationNames } = useLocations();
  const { equipment } = useInventory();

  // Derive status and category options from existing inventory (same as web app)
  const statusOptions = Array.from(
    new Set([...CORE_STATUSES, ...equipment.map((e) => e.status).filter(Boolean)])
  ).sort();
  const categoryOptions = Array.from(
    new Set(equipment.map((e) => e.category).filter(Boolean))
  ).sort() as string[];

  // Form state — pre-populated in edit mode
  const [name, setName] = useState(existingItem?.name ?? '');
  const [category, setCategory] = useState(existingItem?.category ?? '');
  const [source, setSource] = useState(existingItem?.source ?? '');
  const [location, setLocation] = useState(existingItem?.location ?? '');
  const [quantity, setQuantity] = useState(String(existingItem?.quantity ?? '1'));
  const [reserveMin, setReserveMin] = useState(String(existingItem?.reserve_min ?? '0'));
  const [status, setStatus] = useState(existingItem?.status ?? 'Available');
  const [startDate, setStartDate] = useState(existingItem?.start_date ?? '');
  const [endDate, setEndDate] = useState(existingItem?.end_date ?? '');

  // Picker visibility
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: mode === 'add' ? 'Add Item' : 'Edit Item' });
  }, [navigation, mode]);

  async function handleSubmit() {
    if (!name.trim()) {
      Alert.alert('Required', 'Item name is required.');
      return;
    }
    if (!location.trim()) {
      Alert.alert('Required', 'Location is required.');
      return;
    }
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 0) {
      Alert.alert('Invalid', 'Quantity must be 0 or more.');
      return;
    }

    const fields: ItemFields = {
      name,
      category,
      source,
      location,
      quantity: qty,
      reserve_min: parseInt(reserveMin, 10) || 0,
      status,
      start_date: startDate.trim() || null,
      end_date: endDate.trim() || null,
    };

    setSubmitting(true);
    try {
      if (mode === 'add') {
        await addItem(fields);
      } else {
        await updateItem(existingItem!.id, fields);
      }
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to save item.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
      >
        <Field label="Name" required>
          <TextInputField
            value={name}
            onChangeText={setName}
            placeholder="e.g. 4x4 Floppy"
            autoCapitalize="words"
          />
        </Field>

        <Field label="Status">
          <PickerField
            value={status}
            placeholder="Select status"
            onPress={() => setStatusPickerOpen(true)}
          />
        </Field>

        <View className="flex-row gap-3">
          <View className="flex-1">
            <Field label="Quantity" required>
              <TextInputField
                value={quantity}
                onChangeText={setQuantity}
                placeholder="1"
                keyboardType="number-pad"
              />
            </Field>
          </View>
          <View className="flex-1">
            <Field label="Reserve min">
              <TextInputField
                value={reserveMin}
                onChangeText={setReserveMin}
                placeholder="0"
                keyboardType="number-pad"
              />
            </Field>
          </View>
        </View>

        <Field label="Location" required>
          <PickerField
            value={location}
            placeholder="Select location"
            onPress={() => setLocationPickerOpen(true)}
          />
        </Field>

        <Field label="Category">
          <PickerField
            value={category}
            placeholder="Select or leave blank"
            onPress={() => setCategoryPickerOpen(true)}
          />
        </Field>

        <Field label="Source">
          <TextInputField
            value={source}
            onChangeText={setSource}
            placeholder="e.g. House, Rental house"
            autoCapitalize="words"
          />
        </Field>

        <View className="flex-row gap-3">
          <View className="flex-1">
            <Field label="Start date">
              <TextInputField
                value={startDate}
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
              />
            </Field>
          </View>
          <View className="flex-1">
            <Field label="End date">
              <TextInputField
                value={endDate}
                onChangeText={setEndDate}
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
              />
            </Field>
          </View>
        </View>

        <TouchableOpacity
          className={`rounded-xl py-4 items-center mt-2 ${submitting ? 'bg-accent/40' : 'bg-accent'}`}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color="#0f1117" />
          ) : (
            <Text className="text-slate-900 font-semibold text-base">
              {mode === 'add' ? 'Add item' : 'Save changes'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <PickerModal
        visible={statusPickerOpen}
        title="Status"
        options={statusOptions}
        value={status}
        onSelect={setStatus}
        onClose={() => setStatusPickerOpen(false)}
      />
      <PickerModal
        visible={locationPickerOpen}
        title="Location"
        options={locationNames}
        value={location}
        onSelect={setLocation}
        onClose={() => setLocationPickerOpen(false)}
      />
      <PickerModal
        visible={categoryPickerOpen}
        title="Category"
        options={categoryOptions}
        value={category}
        onSelect={setCategory}
        onClose={() => setCategoryPickerOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}
