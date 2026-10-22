// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const reactHooks = require('eslint-plugin-react-hooks');

// eslint-plugin-react-hooks 7 (via eslint-config-expo SDK 58) ships the React
// Compiler rules in its recommended preset, mostly at "error". Keep the two
// classic hooks rules at their preset severity and downgrade every compiler
// rule to "warn" so they can be burned down without blocking CI. Same policy
// as the web app (Decision 3A in fix-plan/WP21).
const hooksPreset = reactHooks.configs.flat?.recommended ?? reactHooks.configs.recommended;
const CLASSIC_HOOK_RULES = new Set(['react-hooks/rules-of-hooks', 'react-hooks/exhaustive-deps']);
const compilerRulesAsWarn = Object.fromEntries(
  Object.keys(hooksPreset.rules)
    .filter((name) => !CLASSIC_HOOK_RULES.has(name))
    .map((name) => [name, 'warn']),
);

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
      ...compilerRulesAsWarn,
    },
  },
]);
