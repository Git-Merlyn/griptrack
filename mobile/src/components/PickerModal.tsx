import React from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import IconButton from './IconButton';
import { Hairline } from './ListSeparators';

export interface PickerOption {
  key: string;
  label: string;
}

/** Wraps plain strings as options whose key and label are the same text. */
export function stringOptions(values: string[]): PickerOption[] {
  return values.map((v) => ({ key: v, label: v }));
}

interface PickerModalProps {
  visible: boolean;
  title: string;
  options: PickerOption[];
  /** Key of the current value; it gets a checkmark. null = nothing selected. */
  selectedKey: string | null;
  /** Called with the tapped option's key; the sheet then closes itself. */
  onSelect: (key: string) => void;
  onClose: () => void;
  /** Shown when options is empty. */
  emptyText?: string;
}

/**
 * Bottom-sheet single-choice picker. Use it instead of Alert.alert for any
 * choice list: Android's Alert shows at most 3 buttons and cannot be
 * dismissed with back or an outside tap unless cancelable is set.
 */
export default function PickerModal({
  visible,
  title,
  options,
  selectedKey,
  onSelect,
  onClose,
  emptyText = 'Nothing to choose from yet.',
}: PickerModalProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable
        className="flex-1 bg-black/60"
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      />
      <View className="bg-surface rounded-t-3xl border-t border-white/10 max-h-[55%]">
        <View className="items-center pt-3 pb-1">
          <View className="w-10 h-1 bg-white/20 rounded-full" />
        </View>
        <View className="px-5 pt-3 pb-2 flex-row items-center justify-between">
          <Text className="text-slate-100 text-lg font-semibold flex-1 mr-3" numberOfLines={2}>
            {title}
          </Text>
          <IconButton icon="close" label="Close" onPress={onClose} />
        </View>
        <FlatList
          data={options}
          keyExtractor={(o) => o.key}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          ItemSeparatorComponent={Hairline}
          ListEmptyComponent={
            <Text className="text-text text-sm text-center py-8">{emptyText}</Text>
          }
          renderItem={({ item: opt }) => {
            const selected = opt.key === selectedKey;
            return (
              <TouchableOpacity
                className="flex-row items-center justify-between py-3.5"
                onPress={() => {
                  onSelect(opt.key);
                  onClose();
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text className={`text-base ${selected ? 'text-accent font-medium' : 'text-slate-100'}`}>
                  {opt.label}
                </Text>
                {selected && <Ionicons name="checkmark" size={20} color="#4debf9" />}
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </Modal>
  );
}
