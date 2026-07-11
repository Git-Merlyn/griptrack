import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useAuthContext } from '../../context/AuthContext';

export default function ForgotPasswordScreen() {
  const { sendPasswordReset } = useAuthContext();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    setError(null);
    setLoading(true);
    const { error } = await sendPasswordReset(email.trim());
    setLoading(false);
    if (error) {
      setError(error);
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <View className="flex-1 bg-background justify-center px-6">
        <View className="bg-surface rounded-2xl p-6 border border-white/10 items-center">
          <Text className="text-success text-4xl mb-4">✓</Text>
          <Text className="text-slate-100 text-lg font-semibold mb-2">
            Check your email
          </Text>
          <Text className="text-text text-sm text-center">
            We've sent a password reset link to{' '}
            <Text className="text-accent">{email}</Text>.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1 justify-center px-6">
        <View className="bg-surface rounded-2xl p-6 border border-white/10">
          <Text className="text-slate-100 text-base mb-6 text-text">
            Enter your email and we'll send you a reset link.
          </Text>

          {error && (
            <View className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 mb-4">
              <Text className="text-danger text-sm">{error}</Text>
            </View>
          )}

          <View className="mb-6">
            <Text className="text-text text-sm mb-1.5">Email</Text>
            <TextInput
              className="bg-background border border-white/10 rounded-lg px-4 py-3 text-slate-100 text-base leading-relaxed"
              placeholder="you@example.com"
              placeholderTextColor="#4b5563"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <TouchableOpacity
            className="bg-accent rounded-lg py-3.5 items-center"
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#0f1117" />
            ) : (
              <Text className="text-slate-900 font-semibold text-base">
                Send reset link
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
