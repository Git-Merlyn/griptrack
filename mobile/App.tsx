import './global.css';
import 'react-native-url-polyfill/auto';

import React from 'react';
import { LogBox } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';

import { AuthProvider } from './src/context/AuthContext';
import { TeamProvider } from './src/context/TeamContext';
import { SyncProvider } from './src/context/SyncContext';
import { OrgProvider } from './src/context/OrgContext';
import RootNavigator from './src/navigation/RootNavigator';

// Supabase's own auto-refresh (autoRefreshToken: true) tries to recover any
// persisted session on launch; a stale/invalid refresh token from a previous
// session (e.g. after that account was signed out or deleted elsewhere) makes
// it log this via console.error, which RN's LogBox surfaces as a full-screen
// dev-only error. The client already falls back to signed-out correctly —
// this is expected, not a bug — so just quiet the dev overlay for it.
LogBox.ignoreLogs(['AuthApiError: Invalid Refresh Token']);

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
