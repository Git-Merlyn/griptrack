import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SettingsStackParamList } from '../lib/types';
import SettingsScreen from '../screens/settings/SettingsScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import ManageMembersScreen from '../screens/settings/ManageMembersScreen';
import ManageLocationsScreen from '../screens/settings/ManageLocationsScreen';
import { STACK_HEADER } from './stackHeader';

const Stack = createNativeStackNavigator<SettingsStackParamList>();


export default function SettingsStack() {
  return (
    <Stack.Navigator screenOptions={STACK_HEADER}>
      <Stack.Screen
        name="SettingsHome"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
      <Stack.Screen
        name="ProfileHome"
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
      <Stack.Screen
        name="ManageMembers"
        component={ManageMembersScreen}
        options={{ title: 'Members' }}
      />
      <Stack.Screen
        name="ManageLocations"
        component={ManageLocationsScreen}
        options={{ title: 'Locations' }}
      />
    </Stack.Navigator>
  );
}
