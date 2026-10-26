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
import { supabase } from '../../lib/supabase';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

export const MIN_PASSWORD_LENGTH = 8;
export const CONFIRM_EMAIL_NOTICE =
  'Account created. Check your email to confirm it, then sign in here.';

/**
 * Crew-only sign-up (WP25, TODO 9.17). handle_new_user() stores
 * signup_role 'crew', so no organization is created: after sign-in the user
 * waits for an invite (WaitingForInviteScreen). Companies are set up on the
 * website.
 */
export default function SignUpScreen({ navigation }: Props) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignUp() {
    const name = fullName.trim();
    const address = email.trim();
    if (!name || !address || !password) {
      setError('Please enter your name, email and a password.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setError(null);
    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: address,
      password,
      options: { data: { full_name: name, signup_role: 'crew' } },
    });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    // With email confirmation on there is no session yet. Without it,
    // RootNavigator picks up the session and shows the waiting screen.
    if (!data.session) {
      navigation.navigate('SignIn', { email: address, notice: CONFIRM_EMAIL_NOTICE });
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View className="flex-1 justify-center px-6 py-10">
          <View className="bg-surface rounded-2xl p-6 border border-white/10">
            <Text className="text-slate-100 text-xl font-semibold mb-2">
              Join your team on GripTrack
            </Text>
            <Text className="text-text text-sm mb-6">
              Create your account, then ask your team&apos;s admin to invite this email.
            </Text>

            {error && (
              <View className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 mb-4">
                <Text className="text-danger text-sm">{error}</Text>
              </View>
            )}

            <View className="mb-4">
              <Text className="text-text text-sm mb-1.5">Full name</Text>
              <TextInput
                className="bg-background border border-white/10 rounded-lg px-4 py-3.5 text-slate-100"
                style={{ fontSize: 16 }}
                placeholder="Pat Grip"
                placeholderTextColor="#4b5563"
                autoCapitalize="words"
                textContentType="name"
                autoComplete="name"
                returnKeyType="next"
                value={fullName}
                onChangeText={setFullName}
                accessibilityLabel="Full name"
              />
            </View>

            <View className="mb-4">
              <Text className="text-text text-sm mb-1.5">Email</Text>
              <TextInput
                className="bg-background border border-white/10 rounded-lg px-4 py-3.5 text-slate-100"
                style={{ fontSize: 16 }}
                placeholder="you@example.com"
                placeholderTextColor="#4b5563"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                returnKeyType="next"
                value={email}
                onChangeText={setEmail}
                accessibilityLabel="Email"
              />
            </View>

            <View className="mb-6">
              <Text className="text-text text-sm mb-1.5">Password</Text>
              <TextInput
                className="bg-background border border-white/10 rounded-lg px-4 py-3.5 text-slate-100"
                style={{ fontSize: 16 }}
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                placeholderTextColor="#4b5563"
                secureTextEntry
                textContentType="newPassword"
                autoComplete="new-password"
                returnKeyType="done"
                onSubmitEditing={handleSignUp}
                value={password}
                onChangeText={setPassword}
                accessibilityLabel="Password"
              />
            </View>

            <TouchableOpacity
              className="bg-accent rounded-lg py-3.5 items-center"
              onPress={handleSignUp}
              disabled={loading}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Create account"
            >
              {loading ? (
                <ActivityIndicator color="#0f1117" />
              ) : (
                <Text className="text-slate-900 font-semibold text-base">Create account</Text>
              )}
            </TouchableOpacity>

            <Text className="text-text/70 text-xs mt-5 text-center">
              Running a team? Create your company on the GripTrack website.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
