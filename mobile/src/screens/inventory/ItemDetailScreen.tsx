import React, { useState, useLayoutEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { InventoryStackParamList, EquipmentItem, canManageInventory, isOrgAdmin } from '../../lib/types';
import { useAuthContext } from '../../context/AuthContext';
import { useEquipmentMutations } from '../../hooks/useEquipmentMutations';
import DamageReportModal from '../../components/DamageReportModal';
import { statusColor, getQty, qtyColor, formatDate, formatDateTime } from '../../lib/helpers';

type Props = NativeStackScreenProps<InventoryStackParamList, 'ItemDetail'>;

export default function ItemDetailScreen({ route, navigation }: Props) {
  const { profile } = useAuthContext();
  const { deleteItem } = useEquipmentMutations();

  // Keep a local copy so the screen updates after damage is reported
  const [item, setItem] = useState<EquipmentItem>(route.params.item);
  const [damageModalVisible, setDamageModalVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canManage = profile?.role != null && canManageInventory(profile.role);
  const canDelete = profile?.role != null && isOrgAdmin(profile.role);

  const qty = getQty(item);
  const qtyCol = qtyColor(item);
  const statusCol = statusColor(item.status);
  const isDamaged = item.status.toLowerCase() === 'damaged';

  useLayoutEffect(() => {
    if (!canManage) return;
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('ItemForm', { mode: 'edit', item })}
          hitSlop={8}
          className="mr-1"
        >
          <Text className="text-accent text-sm font-medium">Edit</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, canManage, item]);

  function confirmDelete() {
    Alert.alert(
      'Delete item',
      `Are you sure you want to permanently delete "${item.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: handleDelete,
        },
      ]
    );
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteItem(item.id);
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to delete item.');
      setDeleting(false);
    }
  }

  return (
    <>
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      >
        {/* Header card */}
        <View className="bg-surface border border-white/10 rounded-2xl p-5 mb-4">
          <Text className="text-accent text-xl font-bold mb-1">{item.name}</Text>

          <View className="flex-row items-center gap-2 mb-4">
            <View style={{ backgroundColor: statusCol }} className="w-2.5 h-2.5 rounded-full" />
            <Text style={{ color: statusCol }} className="text-sm font-semibold">
              {item.status ?? '—'}
            </Text>
          </View>

          <View className="flex-row items-baseline gap-2">
            <Text style={{ color: qtyCol }} className="text-4xl font-bold">{qty}</Text>
            <Text className="text-text text-sm">
              {item.reserve_min > 0 ? `/ ${item.reserve_min} minimum` : 'in stock'}
            </Text>
          </View>
        </View>

        {/* Details card */}
        <View className="bg-surface border border-white/10 rounded-2xl p-5 mb-4">
          <Text className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-3">
            Details
          </Text>
          <DetailRow label="Category" value={item.category} />
          <DetailRow label="Location" value={item.location} />
          <DetailRow label="Source" value={item.source} />
        </View>

        {/* Dates card */}
        {(item.start_date || item.end_date) && (
          <View className="bg-surface border border-white/10 rounded-2xl p-5 mb-4">
            <Text className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-3">
              Rental Period
            </Text>
            <DetailRow label="Start" value={formatDate(item.start_date)} />
            <DetailRow label="End" value={formatDate(item.end_date)} />
          </View>
        )}

        {/* Record info */}
        <View className="bg-surface border border-white/10 rounded-2xl p-5 mb-4">
          <Text className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-3">
            Record Info
          </Text>
          <DetailRow label="Last edited" value={item.updated_by} />
          <DetailRow label="Added" value={formatDateTime(item.created_at)} />
        </View>

        {/* Action buttons — dept_head and above */}
        {canManage && (
          <View className="gap-3">
            {/* View History */}
            <TouchableOpacity
              className="bg-surface border border-white/10 rounded-xl p-4 flex-row items-center gap-3"
              onPress={() => navigation.navigate('AuditLog', { item })}
              activeOpacity={0.8}
            >
              <Ionicons name="time-outline" size={20} color="#4debf9" />
              <Text className="text-accent font-medium">View history</Text>
            </TouchableOpacity>

            {/* Report damage — only show if not already damaged */}
            {!isDamaged && (
              <TouchableOpacity
                className="bg-surface border border-danger/25 rounded-xl p-4 flex-row items-center gap-3"
                onPress={() => setDamageModalVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="warning-outline" size={20} color="#ff4d4d" />
                <Text className="text-danger font-medium">Report damage</Text>
              </TouchableOpacity>
            )}

            {/* Delete — admin/owner only */}
            {canDelete && (
              <TouchableOpacity
                className="bg-surface border border-danger/25 rounded-xl p-4 flex-row items-center gap-3"
                onPress={confirmDelete}
                disabled={deleting}
                activeOpacity={0.8}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#ff4d4d" />
                ) : (
                  <Ionicons name="trash-outline" size={20} color="#ff4d4d" />
                )}
                <Text className="text-danger font-medium">
                  {deleting ? 'Deleting…' : 'Delete item'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      <DamageReportModal
        visible={damageModalVisible}
        item={item}
        onClose={() => setDamageModalVisible(false)}
        onDamageReported={(updated) => setItem(updated)}
      />
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View className="flex-row items-start py-2.5 border-b border-white/5 last:border-0">
      <Text className="text-text text-sm w-28">{label}</Text>
      <Text className="text-slate-100 text-sm flex-1 font-medium">
        {value && value.trim() ? value : '—'}
      </Text>
    </View>
  );
}
