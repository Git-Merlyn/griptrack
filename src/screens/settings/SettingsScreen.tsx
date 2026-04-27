import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOrgContext } from '../../context/OrgContext';
import { useAuthContext } from '../../context/AuthContext';

const ACCENT = '#4debf9';

export default function SettingsScreen() {
  const { features, updateFeatures } = useOrgContext();
  const { profile } = useAuthContext();

  const isOwner = profile?.role === 'owner';
  const isAdmin = profile?.role === 'admin';

  // Local saving state so we can disable toggles while a write is in flight,
  // preventing double-taps from racing.
  const [saving, setSaving] = useState(false);

  async function handleToggle(key: 'teamsEnabled' | 'requestsEnabled', value: boolean) {
    if (!isOwner || saving) return;

    setSaving(true);
    try {
      await updateFeatures({ ...features, [key]: value });
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to save setting. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      {/* Admin read-only notice */}
      {isAdmin && !isOwner && (
        <View className="flex-row items-center gap-2.5 bg-surface border border-white/10 rounded-xl px-4 py-3 mb-5">
          <Ionicons name="lock-closed-outline" size={16} color="#6b7280" />
          <Text className="text-text text-sm flex-1">
            Only the account owner can change these settings.
          </Text>
        </View>
      )}

      {/* ── Optional Features ── */}
      <SectionHeader title="Optional Features" />

      <View className="bg-surface border border-white/10 rounded-2xl overflow-hidden">
        <FeatureRow
          icon="people-outline"
          title="Teams"
          description="Separate your inventory by department (e.g. Grip, Electric). Useful for indie productions where one person manages multiple departments."
          value={features.teamsEnabled}
          disabled={!isOwner || saving}
          onValueChange={(v) => handleToggle('teamsEnabled', v)}
        />

        <View className="h-px bg-white/5 mx-4" />

        <FeatureRow
          icon="clipboard-outline"
          title="Equipment Requests"
          description="Allow crew members to submit gear requests that you can approve or decline."
          value={features.requestsEnabled}
          disabled={!isOwner || saving}
          onValueChange={(v) => handleToggle('requestsEnabled', v)}
        />
      </View>
    </ScrollView>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <Text className="text-text text-xs font-semibold uppercase tracking-widest mb-3 px-1">
      {title}
    </Text>
  );
}

// ─── Feature row ──────────────────────────────────────────────────────────────

interface FeatureRowProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string;
  value: boolean;
  disabled: boolean;
  onValueChange: (v: boolean) => void;
}

function FeatureRow({
  icon,
  title,
  description,
  value,
  disabled,
  onValueChange,
}: FeatureRowProps) {
  return (
    <View className="px-4 py-4">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-row items-center gap-2.5 flex-1">
          <Ionicons name={icon} size={18} color={disabled ? '#4b5563' : ACCENT} />
          <Text
            className="text-base font-semibold"
            style={{ color: disabled ? '#6b7280' : '#f1f5f9' }}
          >
            {title}
          </Text>
        </View>
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ false: '#374151', true: 'rgba(77,235,249,0.35)' }}
          thumbColor={value ? ACCENT : '#6b7280'}
          ios_backgroundColor="#374151"
        />
      </View>
      <Text className="text-text text-xs mt-2 leading-relaxed" style={{ paddingLeft: 28 }}>
        {description}
      </Text>
    </View>
  );
}
