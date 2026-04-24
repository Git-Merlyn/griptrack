import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EquipmentItem } from '../lib/types';
import { useEquipmentMutations } from '../hooks/useEquipmentMutations';

interface Props {
  visible: boolean;
  item: EquipmentItem;
  onClose: () => void;
  onDamageReported: (updated: EquipmentItem) => void;
}

export default function DamageReportModal({ visible, item, onClose, onDamageReported }: Props) {
  const { reportDamage } = useEquipmentMutations();
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const updated = await reportDamage(item, notes);
      setNotes('');
      onDamageReported(updated);
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to report damage.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/60" onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View className="bg-surface rounded-t-3xl border-t border-white/10">
          <View className="items-center pt-3 pb-1">
            <View className="w-10 h-1 bg-white/20 rounded-full" />
          </View>

          <View className="px-5 pt-3 pb-2 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Ionicons name="warning-outline" size={20} color="#ff4d4d" />
              <Text className="text-slate-100 text-lg font-semibold">Report Damage</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <View className="px-5 pb-8">
            {/* Item name */}
            <View className="bg-background border border-white/10 rounded-xl px-4 py-3 mb-4">
              <Text className="text-text text-xs mb-0.5">Item</Text>
              <Text className="text-slate-100 font-medium">{item.name}</Text>
            </View>

            {/* Notes */}
            <Text className="text-text text-sm mb-1.5">
              Damage notes <Text className="text-text/60">(optional)</Text>
            </Text>
            <TextInput
              className="bg-background border border-white/10 rounded-xl px-4 py-3 text-slate-100 text-base mb-5"
              placeholder="Describe the damage…"
              placeholderTextColor="#4b5563"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              value={notes}
              onChangeText={setNotes}
              autoFocus
            />

            {/* Info */}
            <View className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 mb-5 flex-row items-center gap-2">
              <Ionicons name="information-circle-outline" size={16} color="#ff4d4d" />
              <Text className="text-danger/80 text-xs flex-1">
                This will set the item's status to Damaged and log the event with your user ID.
              </Text>
            </View>

            <TouchableOpacity
              className={`rounded-xl py-4 items-center ${submitting ? 'bg-danger/40' : 'bg-danger/80'}`}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold text-base">Confirm damage</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
