import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SettingsStackParamList } from '../lib/types';
import SettingsScreen from '../screens/settings/SettingsScreen';
import ManageMembersScreen from '../screens/settings/ManageMembersScreen';

const Stack = createNativeStackNavigator<SettingsStackParamList>();

const HEADER = {
  headerStyle: { backgroundColor: '#1a1d23' },
  headerTintColor: '#4debf9',
  headerTitleStyle: { color: '#f1f5f9', fontWeight: '600' as const },
};

export default function SettingsStack() {
  return (
    <Stack.Navigator screenOptions={HEADER}>
      <Stack.Screen
        name="SettingsHome"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
      <Stack.Screen
        name="ManageMembers"
        component={ManageMembersScreen}
        options={{ title: 'Members' }}
      />
    </Stack.Navigator>
  );
}
