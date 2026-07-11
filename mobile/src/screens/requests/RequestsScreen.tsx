import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useRequests, EquipmentRequest } from '../../hooks/useRequests';
import { useOrgContext } from '../../context/OrgContext';

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending:  { label: 'Pending',  bg: 'rgba(253,211,0,0.15)',  text: '#ffd600' },
  approved: { label: 'Approved', bg: 'rgba(46,204,113,0.15)', text: '#2ecc71' },
  denied:   { label: 'Denied',   bg: 'rgba(255,77,77,0.15)',  text: '#ff4d4d' },
} as const;

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? {
    label: status, bg: 'rgba(156,163,175,0.15)', text: '#9ca3af',
  };
  return (
    <View style={{ backgroundColor: cfg.bg }} className="rounded-full px-2.5 py-0.5">
      <Text style={{ color: cfg.text }} className="text-xs font-semibold">{cfg.label}</Text>
    </View>
  );
}

function formatDate(ts: string | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

// ─── Request card ─────────────────────────────────────────────────────────────

function RequestCard({
  request,
  isAdmin,
  onApprove,
  onDeny,
}: {
  request: EquipmentRequest;
  isAdmin: boolean;
  onApprove: () => void;
  onDeny: () => void;
}) {
  const isPending = request.status === 'pending';

  return (
    <View className="bg-surface border border-white/10 rounded-xl p-4">
      <View className="flex-row items-start justify-between gap-2 mb-2">
        <View className="flex-1">
          <Text className="text-slate-100 font-semibold text-base" numberOfLines={2}>
            {request.item_name}
          </Text>
          <Text className="text-text text-xs mt-0.5">
            Qty: {request.quantity}
            {request.requester_name ? `  ·  ${request.requester_name}` : ''}
          </Text>
        </View>
        <StatusBadge status={request.status} />
      </View>

      {request.notes ? (
        <View className="border-l-2 border-white/15 pl-3 mb-2">
          <Text className="text-slate-300 text-xs">{request.notes}</Text>
        </View>
      ) : null}

      <View className="flex-row items-center justify-between mt-1">
        <Text className="text-text text-xs">{formatDate(request.created_at)}</Text>

        {isAdmin && isPending && (
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={onDeny}
              className="border border-danger/30 rounded-lg px-3 py-1.5"
              activeOpacity={0.8}
            >
              <Text className="text-danger text-xs font-medium">Deny</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onApprove}
              className="bg-success/15 border border-success/30 rounded-lg px-3 py-1.5"
              activeOpacity={0.8}
            >
              <Text className="text-success text-xs font-medium">Approve</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isAdmin && request.reviewed_by && (
          <Text className="text-text text-xs">
            Reviewed by {request.reviewed_by}
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── New request modal ────────────────────────────────────────────────────────

function NewRequestModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (params: { itemName: string; quantity: number; notes: string }) => Promise<void>;
}) {
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!itemName.trim()) {
      Alert.alert('Required', 'Please enter an item name.');
      return;
    }
    const qty = parseInt(quantity, 10);
    if (!qty || qty < 1) {
      Alert.alert('Invalid', 'Quantity must be at least 1.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ itemName: itemName.trim(), quantity: qty, notes });
      setItemName('');
      setQuantity('1');
      setNotes('');
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to submit request.');
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
            <Text className="text-slate-100 text-lg font-semibold">New Request</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <View className="mb-4">
              <Text className="text-text text-sm mb-1.5">Item name *</Text>
              <TextInput
                className="bg-background border border-white/10 rounded-xl px-4 pt-3.5 pb-8 text-slate-100 text-base"
                placeholder="e.g. 4x4 Floppy"
                placeholderTextColor="#4b5563"
                value={itemName}
                onChangeText={setItemName}
                autoCapitalize="words"
              />
            </View>

            <View className="mb-4">
              <Text className="text-text text-sm mb-1.5">Quantity *</Text>
              <TextInput
                className="bg-background border border-white/10 rounded-xl px-4 pt-3.5 pb-8 text-slate-100 text-base"
                placeholder="1"
                placeholderTextColor="#4b5563"
                keyboardType="number-pad"
                value={quantity}
                onChangeText={setQuantity}
                returnKeyType="done"
              />
            </View>

            <View className="mb-6">
              <Text className="text-text text-sm mb-1.5">Notes</Text>
              <TextInput
                className="bg-background border border-white/10 rounded-xl px-4 pt-3.5 pb-8 text-slate-100 text-base"
                placeholder="Any details or context…"
                placeholderTextColor="#4b5563"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                value={notes}
                onChangeText={setNotes}
              />
            </View>

            <TouchableOpacity
              className={`rounded-xl py-4 items-center ${submitting ? 'bg-accent/40' : 'bg-accent'}`}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#0f1117" />
              ) : (
                <Text className="text-slate-900 font-semibold text-base">Submit request</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function RequestsScreen() {
  const { requests, loading, error, isAdmin, refresh, submitRequest, reviewRequest } =
    useRequests();
  const { features } = useOrgContext();
  const navigation = useNavigation();

  const [refreshing, setRefreshing] = useState(false);
  const [newRequestVisible, setNewRequestVisible] = useState(false);

  // Safety net: if requests feature is disabled, bounce back to Inventory
  useEffect(() => {
    if (!features.requestsEnabled) {
      navigation.navigate('Inventory' as never);
    }
  }, [features.requestsEnabled, navigation]);

  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  async function handleReview(requestId: string, status: 'approved' | 'denied') {
    try {
      await reviewRequest(requestId, status);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Action failed.');
    }
  }

  return (
    <View className="flex-1 bg-background">
      {error && (
        <View className="mx-4 mt-3 bg-danger/10 border border-danger/30 rounded-lg px-4 py-3">
          <Text className="text-danger text-sm">{error}</Text>
        </View>
      )}

      {loading && !refreshing ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#4debf9" size="large" />
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          ItemSeparatorComponent={() => <View className="h-3" />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#4debf9" />
          }
          ListHeaderComponent={
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-text text-sm">
                {requests.length} request{requests.length !== 1 ? 's' : ''}
              </Text>
              {isAdmin && (
                <Text className="text-accent text-xs font-medium">Admin view</Text>
              )}
            </View>
          }
          ListEmptyComponent={
            <View className="items-center justify-center pt-20">
              <Ionicons name="clipboard-outline" size={40} color="#374151" />
              <Text className="text-text mt-3 text-sm">No requests yet</Text>
            </View>
          }
          renderItem={({ item }) => (
            <RequestCard
              request={item}
              isAdmin={isAdmin}
              onApprove={() => handleReview(item.id, 'approved')}
              onDeny={() => handleReview(item.id, 'denied')}
            />
          )}
        />
      )}

      {/* FAB — crew can submit new requests */}
      {!isAdmin && (
        <TouchableOpacity
          className="absolute bottom-6 right-5 bg-accent w-14 h-14 rounded-full items-center justify-center shadow-lg"
          onPress={() => setNewRequestVisible(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={28} color="#0f1117" />
        </TouchableOpacity>
      )}

      <NewRequestModal
        visible={newRequestVisible}
        onClose={() => setNewRequestVisible(false)}
        onSubmit={submitRequest}
      />
    </View>
  );
}
