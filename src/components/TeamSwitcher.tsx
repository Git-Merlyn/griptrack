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
import { useTeamContext } from '../context/TeamContext';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function TeamSwitcher({ visible, onClose }: Props) {
  const { teams, activeTeamId, setActiveTeamId, loadingTeams } = useTeamContext();

  function handleSelect(id: string) {
    setActiveTeamId(id);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/60" onPress={onClose} />

      <View className="bg-surface rounded-t-3xl border-t border-white/10 max-h-[60%]">
        <View className="items-center pt-3 pb-1">
          <View className="w-10 h-1 bg-white/20 rounded-full" />
        </View>

        <View className="px-5 pt-3 pb-2 flex-row items-center justify-between">
          <Text className="text-slate-100 text-lg font-semibold">Switch Team</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color="#6b7280" />
          </TouchableOpacity>
        </View>

        {loadingTeams ? (
          <View className="items-center py-10">
            <ActivityIndicator color="#4debf9" />
          </View>
        ) : (
          <FlatList
            data={teams}
            keyExtractor={(t) => t.id}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
            ItemSeparatorComponent={() => <View className="h-px bg-white/5" />}
            ListEmptyComponent={
              <View className="items-center py-10">
                <Text className="text-text text-sm">No teams found</Text>
              </View>
            }
            renderItem={({ item: team }) => {
              const isActive = activeTeamId === team.id;
              return (
                <TouchableOpacity
                  className="flex-row items-center justify-between py-3.5"
                  onPress={() => handleSelect(team.id)}
                  activeOpacity={0.7}
                >
                  <View className="flex-row items-center gap-3 flex-1 min-w-0">
                    <View className="w-8 h-8 rounded-full bg-accent/15 items-center justify-center">
                      <Ionicons name="people-outline" size={16} color="#4debf9" />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text
                        className={`text-base font-medium ${isActive ? 'text-accent' : 'text-slate-100'}`}
                        numberOfLines={1}
                      >
                        {team.name}
                      </Text>
                      {team.max_seats != null && (
                        <Text className="text-text text-xs">Max {team.max_seats} seats</Text>
                      )}
                    </View>
                  </View>
                  {isActive && <Ionicons name="checkmark" size={20} color="#4debf9" />}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}
