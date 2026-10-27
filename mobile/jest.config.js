module.exports = {
  preset: 'jest-expo',
  // Shared code outside mobile/ (<repo>/shared, <repo>/supabase/functions/_shared/pdf)
  // is compiled with helper imports such as @babel/runtime. Resolve those from
  // mobile/node_modules too: CI's mobile job installs only this folder.
  moduleDirectories: ['node_modules', '<rootDir>/node_modules'],
  moduleNameMapper: {
    '^expo-crypto$': '<rootDir>/src/test-utils/expoCryptoMock.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|nativewind)',
  ],
};
