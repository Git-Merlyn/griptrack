import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { InventoryStackParamList } from '../../lib/types';
import { statusColor, getQty, qtyColor, formatDate } from '../../lib/helpers';

type Props = NativeStackScreenProps<InventoryStackParamList, 'ItemDetail'>;

export default function ItemDetailScreen({ route }: Props) {
  const { item } = route.params;
  const qty = getQty(item);
  const qtyCol = qtyColor(item);
  const statusCol = statusColor(item.status);

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

      {/* Header card */}
      <View className="bg-surface border border-white/10 rounded-2xl p-5 mb-4">
        <Text className="text-accent text-xl font-bold mb-1">{item.name}</Text>

        {/* Status badge */}
        <View className="flex-row items-center gap-2 mb-4">
          <View style={{ backgroundColor: statusCol }} className="w-2.5 h-2.5 rounded-full" />
          <Text style={{ color: statusCol }} className="text-sm font-semibold">
            {item.status ?? '—'}
          </Text>
        </View>

        {/* Quantity */}
        <View className="flex-row items-baseline gap-2">
          <Text style={{ color: qtyCol }} className="text-4xl font-bold">
            {qty}
          </Text>
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

      {/* Meta card */}
      <View className="bg-surface border border-white/10 rounded-2xl p-5">
        <Text className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-3">
          Record Info
        </Text>
        <DetailRow label="Updated by" value={item.updated_by} />
        <DetailRow label="Created" value={formatDate(item.created_at)} />
      </View>

    </ScrollView>
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
