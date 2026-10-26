import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../lib/types';
import SignInScreen from '../screens/auth/SignInScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SignIn" component={SignInScreen} />
      <Stack.Screen
        name="SignUp"
        component={SignUpScreen}
        options={{
          headerShown: true,
          title: 'Create account',
          headerBackTitle: 'Sign in',
          headerStyle: { backgroundColor: '#1a1d23' },
          headerTintColor: '#4debf9',
          headerTitleStyle: { color: '#f1f5f9' },
        }}
      />
      <Stack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{
          headerShown: true,
          title: 'Reset Password',
          headerBackTitle: 'Sign in',
          headerStyle: { backgroundColor: '#1a1d23' },
          headerTintColor: '#4debf9',
          headerTitleStyle: { color: '#f1f5f9' },
        }}
      />
    </Stack.Navigator>
  );
}
