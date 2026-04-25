/**
 * DevRoleSwitcher — debug-only floating tool for testing permission levels.
 *
 * Only rendered in __DEV__ builds. The entire component tree is dead code in
 * production (React Native strips __DEV__ === false branches at build time).
 *
 * Usage: tap the badge in the bottom-left corner to open the panel.
 * Selecting a role overrides profile.role in AuthContext, so all derived
 * permission flags (canManageInventory, isOrgAdmin, canSwitchTeams) update
 * immediately across the app. Tap "Clear override" to restore the real role.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthContext } from '../context/AuthContext';
import {
  Role,
  canManageInventory,
  canSwitchTeams,
  isOrgAdmin,
} from '../lib/types';

// ─── Config ───────────────────────────────────────────────────────────────────

const ROLES: Role[] = ['owner', 'admin', 'department_head', 'crew'];

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  department_head: 'Dept Head',
  crew: 'Crew',
};

const ROLE_ABBR: Record<Role, string> = {
  owner: 'OWN',
  admin: 'ADM',
  department_head: 'DH',
  crew: 'CRW',
};

// ─── Permission flags shown in the readout ────────────────────────────────────

interface Flag {
  label: string;
  value: boolean;
}

function getFlags(role: Role): Flag[] {
  return [
    { label: 'Can manage inventory', value: canManageInventory(role) },
    { label: 'Can switch teams',     value: canSwitchTeams(role) },
    { label: 'Is org admin',         value: isOrgAdmin(role) },
  ];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DevRoleSwitcher() {
  // Strip entirely in production — this is a compile-time guard
  if (!__DEV__) return null;

  const { profile, roleOverride, setRoleOverride } = useAuthContext();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const realRole = profile?.role ?? 'crew';
  const activeRole = roleOverride ?? realRole;
  const isOverriding = roleOverride !== null;

  return (
    <>
      {/* ── Floating badge ── */}
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={{ bottom: insets.bottom + 90, left: 12 }}
        className="absolute bg-[#7c3aed] rounded-xl px-2.5 py-1.5 flex-row items-center gap-1.5 shadow-lg"
        activeOpacity={0.85}
        hitSlop={8}
      >
        <Ionicons name="bug-outline" size={12} color="#fff" />
        <Text className="text-white text-xs font-bold tracking-wide">
          {ROLE_ABBR[activeRole]}
          {isOverriding ? ' ●' : ''}
        </Text>
      </TouchableOpacity>

      {/* ── Panel ── */}
      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable className="flex-1 bg-black/60" onPress={() => setOpen(false)} />

        <View
          style={{ paddingBottom: insets.bottom + 8 }}
          className="bg-surface rounded-t-3xl border-t border-white/10"
        >
          {/* Handle */}
          <View className="items-center pt-3 pb-2">
            <View className="w-10 h-1 bg-white/20 rounded-full" />
          </View>

          {/* Header */}
          <View className="px-5 pt-1 pb-3 flex-row items-center justify-between border-b border-white/5">
            <View className="flex-row items-center gap-2">
              <View className="bg-[#7c3aed]/20 rounded-lg px-2 py-0.5">
                <Text className="text-[#a78bfa] text-xs font-bold">DEV ONLY</Text>
              </View>
              <Text className="text-slate-100 text-base font-semibold">Role Override</Text>
            </View>
            <TouchableOpacity onPress={() => setOpen(false)} hitSlop={8}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 20, gap: 16 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Real role info */}
            <View className="flex-row items-center gap-2">
              <Text className="text-text text-sm">Real role:</Text>
              <Text className="text-slate-300 text-sm font-medium">{ROLE_LABELS[realRole]}</Text>
              {isOverriding && (
                <View className="bg-[#7c3aed]/20 rounded-full px-2 py-0.5 ml-1">
                  <Text className="text-[#a78bfa] text-xs">overriding</Text>
                </View>
              )}
            </View>

            {/* Role picker */}
            <View>
              <Text className="text-text text-xs font-semibold uppercase tracking-widest mb-2">
                Active role
              </Text>
              <View className="gap-2">
                {ROLES.map((role) => {
                  const isActive = activeRole === role;
                  const isReal = role === realRole && !isOverriding;
                  return (
                    <TouchableOpacity
                      key={role}
                      onPress={() => setRoleOverride(role === realRole ? null : role)}
                      activeOpacity={0.75}
                      className={`flex-row items-center justify-between px-4 py-3 rounded-xl border ${
                        isActive
                          ? 'bg-[#7c3aed]/15 border-[#7c3aed]/40'
                          : 'bg-background border-white/8'
                      }`}
                    >
                      <View className="flex-row items-center gap-3">
                        <View
                          className={`w-2.5 h-2.5 rounded-full ${
                            isActive ? 'bg-[#a78bfa]' : 'bg-white/15'
                          }`}
                        />
                        <Text
                          className={`text-sm font-medium ${
                            isActive ? 'text-[#a78bfa]' : 'text-slate-300'
                          }`}
                        >
                          {ROLE_LABELS[role]}
                        </Text>
                        {isReal && (
                          <Text className="text-text text-xs">(your real role)</Text>
                        )}
                      </View>
                      {isActive && (
                        <Ionicons name="checkmark" size={18} color="#a78bfa" />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Permission flags */}
            <View>
              <Text className="text-text text-xs font-semibold uppercase tracking-widest mb-2">
                Permission flags
              </Text>
              <View className="bg-background border border-white/8 rounded-xl overflow-hidden">
                {getFlags(activeRole).map((flag, i) => (
                  <View
                    key={flag.label}
                    className={`flex-row items-center justify-between px-4 py-3 ${
                      i < getFlags(activeRole).length - 1 ? 'border-b border-white/5' : ''
                    }`}
                  >
                    <Text className="text-text text-sm">{flag.label}</Text>
                    <View className="flex-row items-center gap-1.5">
                      <Ionicons
                        name={flag.value ? 'checkmark-circle' : 'close-circle'}
                        size={18}
                        color={flag.value ? '#2ecc71' : '#ff4d4d'}
                      />
                      <Text
                        className="text-xs font-semibold"
                        style={{ color: flag.value ? '#2ecc71' : '#ff4d4d' }}
                      >
                        {flag.value ? 'Yes' : 'No'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* Clear override */}
            {isOverriding && (
              <TouchableOpacity
                onPress={() => { setRoleOverride(null); setOpen(false); }}
                className="bg-[#7c3aed]/10 border border-[#7c3aed]/30 rounded-xl py-3 items-center"
                activeOpacity={0.8}
              >
                <Text className="text-[#a78bfa] text-sm font-medium">
                  Clear override — restore {ROLE_LABELS[realRole]}
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
