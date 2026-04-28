import React from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { AppTabParamList } from '../lib/types';
import { isOrgAdmin } from '../lib/types';
import InventoryStack from './InventoryStack';
import MoveScreen from '../screens/move/MoveScreen';
import RequestsScreen from '../screens/requests/RequestsScreen';
import SettingsStack from './SettingsStack';
import ProfileStack from './ProfileStack';
import SyncStatusBar from '../components/SyncStatusBar';
import DevRoleSwitcher from '../components/DevRoleSwitcher';
import { useOrgContext } from '../context/OrgContext';
import { useAuthContext } from '../context/AuthContext';

const Tab = createBottomTabNavigator<AppTabParamList>();

const ACCENT  = '#4debf9';
const INACTIVE = '#6b7280';
const BG      = '#1a1d23';
const BORDER  = '#0f1117';

export default function AppNavigator() {
  const { features } = useOrgContext();
  const { profile } = useAuthContext();

  const canSeeSettings = profile?.role != null && isOrgAdmin(profile.role);

  return (
    <View style={{ flex: 1 }}>
      <SyncStatusBar />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: {
            backgroundColor: BG,
            borderTopColor: BORDER,
            borderTopWidth: 1,
          },
          tabBarActiveTintColor: ACCENT,
          tabBarInactiveTintColor: INACTIVE,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
          tabBarIcon: ({ color, size }) => {
            const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
              Inventory: 'cube-outline',
              Move:      'swap-horizontal-outline',
              Requests:  'clipboard-outline',
              Settings:  'settings-outline',
              Profile:   'person-outline',
            };
            return <Ionicons name={icons[route.name]} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Inventory" component={InventoryStack} />
        <Tab.Screen
          name="Move"
          component={MoveScreen}
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: BG },
            headerTintColor: ACCENT,
            headerTitleStyle: { color: '#f1f5f9' },
            title: 'Move Equipment',
          }}
        />
        {features.requestsEnabled && (
          <Tab.Screen
            name="Requests"
            component={RequestsScreen}
            options={{
              headerShown: true,
              headerStyle: { backgroundColor: BG },
              headerTintColor: ACCENT,
              headerTitleStyle: { color: '#f1f5f9' },
              title: 'Requests',
            }}
          />
        )}
        {/* Settings tab — owner and admin only */}
        {canSeeSettings && (
          <Tab.Screen name="Settings" component={SettingsStack} />
        )}
        <Tab.Screen name="Profile" component={ProfileStack} />
      </Tab.Navigator>
      {/* Dev-only role switcher — stripped from prod builds by dead code elimination */}
      <DevRoleSwitcher />
    </View>
  );
}
