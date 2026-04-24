import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../lib/types';
import { useAuthContext } from '../../context/AuthContext';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignIn'>;

export default function SignInScreen({ navigation }: Props) {
  const { signIn } = useAuthContext();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError(null);
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) setError(error);
    // On success, RootNavigator picks up the new session and navigates to App
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 justify-center px-6 py-12">
          {/* Logo / wordmark */}
          <View className="items-center mb-10">
            <Text className="text-3xl font-bold text-accent tracking-tight">
              GripTrack
            </Text>
            <Text className="text-text text-sm mt-1">
              Film production inventory
            </Text>
          </View>

          {/* Card */}
          <View className="bg-surface rounded-2xl p-6 border border-white/10">
            <Text className="text-slate-100 text-xl font-semibold mb-6">
              Sign in
            </Text>

            {/* Error banner */}
            {error && (
              <View className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 mb-4">
                <Text className="text-danger text-sm">{error}</Text>
              </View>
            )}

            {/* Email */}
            <View className="mb-4">
              <Text className="text-text text-sm mb-1.5">Email</Text>
              <TextInput
                className="bg-background border border-white/10 rounded-lg px-4 py-3 text-slate-100 text-base"
                placeholder="you@example.com"
                placeholderTextColor="#4b5563"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                returnKeyType="next"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            {/* Password */}
            <View className="mb-6">
              <Text className="text-text text-sm mb-1.5">Password</Text>
              <TextInput
                className="bg-background border border-white/10 rounded-lg px-4 py-3 text-slate-100 text-base"
                placeholder="••••••••"
                placeholderTextColor="#4b5563"
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleSignIn}
                value={password}
                onChangeText={setPassword}
              />
            </View>

            {/* Sign in button */}
            <TouchableOpacity
              className="bg-accent rounded-lg py-3.5 items-center"
              onPress={handleSignIn}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#0f1117" />
              ) : (
                <Text className="text-slate-900 font-semibold text-base">
                  Sign in
                </Text>
              )}
            </TouchableOpacity>

            {/* Forgot password link */}
            <TouchableOpacity
              className="mt-4 items-center"
              onPress={() => navigation.navigate('ForgotPassword')}
              activeOpacity={0.7}
            >
              <Text className="text-accent text-sm">Forgot password?</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
