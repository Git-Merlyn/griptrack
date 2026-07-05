import './global.css';
import 'react-native-url-polyfill/auto';

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';

import { AuthProvider } from './src/context/AuthContext';
import { TeamProvider } from './src/context/TeamContext';
import { SyncProvider } from './src/context/SyncContext';
import { OrgProvider } from './src/context/OrgContext';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <AuthProvider>
          <TeamProvider>
            {/* OrgProvider above SyncProvider: sync reads the teams_enabled
                feature flag to decide org-wide vs team-scoped sync. */}
            <OrgProvider>
              <SyncProvider>
                <StatusBar style="light" />
                <RootNavigator />
              </SyncProvider>
            </OrgProvider>
          </TeamProvider>
        </AuthProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
