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
            <SyncProvider>
              <OrgProvider>
                <StatusBar style="light" />
                <RootNavigator />
              </OrgProvider>
            </SyncProvider>
          </TeamProvider>
        </AuthProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
