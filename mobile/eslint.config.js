// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'ios/*', 'android/*'],
  },
  {
    // Build/config files are CommonJS and run in Node.
    files: ['*.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        module: 'writable',
        require: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
      },
    },
  },
  {
    // WP18 baseline: rules that had errors when lint was introduced are
    // warnings until burned down. Do not add rules here; fix the code.
    rules: {
      'react/no-unescaped-entities': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
    },
  },
]);
