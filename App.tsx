import './global.css';
import 'react-native-url-polyfill/auto';

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';

import { AuthProvider } from './src/context/AuthContext';
import { ProductionProvider } from './src/context/ProductionContext';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <AuthProvider>
          <ProductionProvider>
            <StatusBar style="light" />
            <RootNavigator />
          </ProductionProvider>
        </AuthProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
