import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useOrgContext } from '../../context/OrgContext';
import { useAuthContext } from '../../context/AuthContext';
import { SettingsStackParamList, isOrgAdmin, canManageInventory } from '../../lib/types';
import ToggleSwitch from '../../components/ToggleSwitch';

type SettingsNav = NativeStackNavigationProp<SettingsStackParamList, 'SettingsHome'>;

export default function SettingsScreen() {
  const { features, updateFeatures } = useOrgContext();
  const { profile } = useAuthContext();
  const navigation = useNavigation<SettingsNav>();

  const isOwner = profile?.role === 'owner';
  const isAdmin = profile?.role === 'admin';
  const isOrgAdminUser = profile?.role != null && isOrgAdmin(profile.role);
  const canManageLocs = profile?.role != null && canManageInventory(profile.role);

  const [saving, setSaving] = useState(false);

  async function handleToggle(key: 'teamsEnabled' | 'requestsEnabled', value: boolean) {
    if (!isOwner || saving) return;
    setSaving(true);
    try {
      await updateFeatures({ ...features, [key]: value });
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      {/* ── Account — all roles ── */}
      <SectionHeader title="Account" />
      <View className="bg-surface border border-white/10 rounded-2xl overflow-hidden mb-6">
        <NavRow
          icon="person-outline"
          title="Profile"
          subtitle="Name, email, password"
          onPress={() => navigation.navigate('ProfileHome')}
        />
      </View>

      {/* ── Optional Features — owner/admin only ── */}
      {isOrgAdminUser && (
        <>
          {/* Admin read-only notice */}
          {isAdmin && !isOwner && (
            <View className="flex-row items-center gap-2.5 bg-surface border border-white/10 rounded-xl px-4 py-3 mb-5">
              <Ionicons name="lock-closed-outline" size={16} color="#6b7280" />
              <Text className="text-text text-sm flex-1">
                Only the account owner can change these settings.
              </Text>
            </View>
          )}

          <SectionHeader title="Optional Features" />
          <View className="bg-surface border border-white/10 rounded-2xl overflow-hidden mb-6">
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

          <SectionHeader title="Team Management" />
          <View className="bg-surface border border-white/10 rounded-2xl overflow-hidden mb-6">
            <NavRow
              icon="people-outline"
              title="Members"
              subtitle="Add, remove, and manage roles"
              onPress={() => navigation.navigate('ManageMembers')}
            />
          </View>
        </>
      )}

      {/* ── Locations — dept_head, admin, owner only ── */}
      {canManageLocs && (
        <>
          <SectionHeader title="Locations" />
          <View className="bg-surface border border-white/10 rounded-2xl overflow-hidden mb-6">
            <NavRow
              icon="location-outline"
              title="Manage Locations"
              subtitle="Add, rename, or deactivate truck and stage locations"
              onPress={() => navigation.navigate('ManageLocations')}
            />
          </View>
        </>
      )}

      {/* ── Legal ── */}
      <View className="flex-row justify-center items-center gap-2 mt-2">
        <TouchableOpacity onPress={() => Linking.openURL('https://griptrack.app/privacy')} hitSlop={8}>
          <Text className="text-text/40 text-xs">Privacy Policy</Text>
        </TouchableOpacity>
        <Text className="text-text/30 text-xs">·</Text>
        <TouchableOpacity onPress={() => Linking.openURL('https://griptrack.app/terms')} hitSlop={8}>
          <Text className="text-text/40 text-xs">Terms of Service</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <Text className="text-text text-xs font-semibold uppercase tracking-widest mb-3 px-1">
      {title}
    </Text>
  );
}

function NavRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      className="flex-row items-center gap-3 px-4 py-4"
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Ionicons name={icon} size={18} color="#4debf9" />
      <View className="flex-1">
        <Text className="text-slate-100 font-medium">{title}</Text>
        <Text className="text-text text-xs mt-0.5">{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#6b7280" />
    </TouchableOpacity>
  );
}

interface FeatureRowProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string;
  value: boolean;
  disabled: boolean;
  onValueChange: (v: boolean) => void;
}

function FeatureRow({ icon, title, description, value, disabled, onValueChange }: FeatureRowProps) {
  return (
    <View className="px-4 py-4">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-row items-center gap-2.5 flex-1">
          <Ionicons name={icon} size={18} color={disabled ? '#4b5563' : '#4debf9'} />
          <Text className="text-base font-semibold" style={{ color: disabled ? '#6b7280' : '#f1f5f9' }}>
            {title}
          </Text>
        </View>
        <ToggleSwitch value={value} onValueChange={onValueChange} disabled={disabled} />
      </View>
      <Text className="text-text text-xs mt-2 leading-relaxed" style={{ paddingLeft: 28 }}>
        {description}
      </Text>
    </View>
  );
}
