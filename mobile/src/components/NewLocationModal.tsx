import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import IconButton from './IconButton';
import { useAuthContext } from '../context/AuthContext';
import { useLocationMutations } from '../hooks/useLocationMutations';
import { getAllLocationsByOrg } from '../lib/db';
import { newLocationNameError } from '../lib/locationOptions';

interface NewLocationModalProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the saved name after the location is created (or queued offline). */
  onCreated: (name: string) => void;
}

/**
 * Bottom sheet to create a location from another screen (Add/Edit Item).
 * Same look as Settings › Manage Locations. addLocation is offline-aware:
 * online it inserts in Supabase first; offline it saves locally and queues.
 */
export default function NewLocationModal({ visible, onClose, onCreated }: NewLocationModalProps) {
  const { profile } = useAuthContext();
  const { addLocation } = useLocationMutations();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  function close() {
    setName('');
    onClose();
  }

  async function save() {
    const allNames = profile?.org_id ? getAllLocationsByOrg(profile.org_id).map((l) => l.name) : [];
    const error = newLocationNameError(name, allNames);
    if (error) {
      Alert.alert('Location', error);
      return;
    }
    const trimmed = name.trim();
    setSaving(true);
    try {
      await addLocation(trimmed);
      setName('');
      onCreated(trimmed);
    } catch (err: any) {
      // Includes the server's neutral "Plan limit: ..." text on Free orgs.
      Alert.alert('Could not add location', err?.message ?? 'Failed to save location.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <Pressable className="flex-1 bg-black/60" onPress={close} accessibilityRole="button" accessibilityLabel="Dismiss" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View className="bg-surface rounded-t-3xl border-t border-white/10">
          <View className="items-center pt-3 pb-1">
            <View className="w-10 h-1 bg-white/20 rounded-full" />
          </View>
          <View className="px-5 pt-3 pb-2 flex-row items-center justify-between">
            <Text className="text-slate-100 text-lg font-semibold">New location</Text>
            <IconButton icon="close" label="Close" onPress={close} />
          </View>
          <View style={{ padding: 20, paddingBottom: 40 }}>
            <TextInput
              className="bg-background border border-white/10 rounded-xl px-4 py-3.5 text-slate-100 mb-5"
              style={{ fontSize: 16 }}
              placeholder="e.g. G&E Truck, Stage A…"
              placeholderTextColor="#4b5563"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={save}
              autoFocus
              accessibilityLabel="Location name"
            />
            <TouchableOpacity
              className={`rounded-xl py-4 items-center ${saving ? 'bg-accent/40' : 'bg-accent'}`}
              onPress={save}
              disabled={saving}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              {saving ? (
                <ActivityIndicator color="#0f1117" />
              ) : (
                <Text className="text-slate-900 font-semibold text-base">Add location</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
