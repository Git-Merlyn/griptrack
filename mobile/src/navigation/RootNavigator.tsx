import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthContext } from '../context/AuthContext';
import { RootStackParamList } from '../lib/types';
import AuthStack from './AuthStack';
import AppNavigator from './AppNavigator';
import OrgUnavailableScreen from '../screens/auth/OrgUnavailableScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { session, profile, loading, offline } = useAuthContext();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#4debf9" size="large" />
      </View>
    );
  }

  // Offline with a stored session still counts as signed in (H7). auth-js
  // removes the stored session on a real sign-out or an invalid refresh token.
  const signedIn = !!session || offline;

  // Signed in but no org identity (bootstrap failed with no cache, or offline
  // on the very first launch): explain and offer Retry / Sign out (L59).
  if (signedIn && !profile) {
    return <OrgUnavailableScreen />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      {signedIn ? (
        <Stack.Screen name="App" component={AppNavigator} />
      ) : (
        <Stack.Screen name="Auth" component={AuthStack} />
      )}
    </Stack.Navigator>
  );
}
