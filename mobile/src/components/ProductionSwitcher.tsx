import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Production } from '../lib/types';
import { useProductionContext } from '../context/ProductionContext';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function ProductionSwitcher({ visible, onClose }: Props) {
  const { productions, activeProductionId, setActiveProductionId, loadingProductions } =
    useProductionContext();

  function handleSelect(id: string | null) {
    setActiveProductionId(id);
    onClose();
  }

  const activeProductions = productions.filter((p) => p.status === 'active');
  const archivedProductions = productions.filter((p) => p.status === 'archived');

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* Backdrop */}
      <Pressable
        className="flex-1 bg-black/60"
        onPress={onClose}
      />

      {/* Sheet */}
      <View className="bg-surface rounded-t-3xl border-t border-white/10 max-h-[70%]">
        {/* Handle */}
        <View className="items-center pt-3 pb-1">
          <View className="w-10 h-1 bg-white/20 rounded-full" />
        </View>

        <View className="px-5 pt-3 pb-2 flex-row items-center justify-between">
          <Text className="text-slate-100 text-lg font-semibold">Switch Production</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color="#6b7280" />
          </TouchableOpacity>
        </View>

        {loadingProductions ? (
          <View className="items-center py-10">
            <ActivityIndicator color="#4debf9" />
          </View>
        ) : (
          <FlatList
            data={[null, ...activeProductions, ...archivedProductions]}
            keyExtractor={(item) => item?.id ?? 'general'}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
            ItemSeparatorComponent={() => <View className="h-px bg-white/5" />}
            renderItem={({ item }) => {
              const isGeneral = item === null;
              const id = isGeneral ? null : (item as Production).id;
              const name = isGeneral ? 'General Pool' : (item as Production).name;
              const isArchived = !isGeneral && (item as Production).status === 'archived';
              const isActive = activeProductionId === id;

              return (
                <TouchableOpacity
                  className="flex-row items-center justify-between py-3.5"
                  onPress={() => handleSelect(id)}
                  activeOpacity={0.7}
                >
                  <View className="flex-row items-center gap-3 flex-1 min-w-0">
                    <View
                      className={`w-8 h-8 rounded-full items-center justify-center ${
                        isGeneral ? 'bg-white/10' : 'bg-accent/15'
                      }`}
                    >
                      <Ionicons
                        name={isGeneral ? 'layers-outline' : 'film-outline'}
                        size={16}
                        color={isGeneral ? '#6b7280' : '#4debf9'}
                      />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text
                        className={`text-base font-medium truncate ${
                          isActive ? 'text-accent' : 'text-slate-100'
                        }`}
                        numberOfLines={1}
                      >
                        {name}
                      </Text>
                      {isArchived && (
                        <Text className="text-text text-xs">Archived</Text>
                      )}
                    </View>
                  </View>

                  {isActive && (
                    <Ionicons name="checkmark" size={20} color="#4debf9" />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}
