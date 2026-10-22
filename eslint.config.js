import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import { reactRefresh } from 'eslint-plugin-react-refresh'

// eslint-plugin-react-hooks 7 ships the React Compiler rules in its
// recommended preset (mostly at "error"). Keep the two classic hooks rules at
// their preset severity and downgrade every compiler rule to "warn" so they
// can be burned down without blocking CI. (Decision 3A in fix-plan/WP21.)
const hooksPreset = reactHooks.configs.flat?.recommended ?? reactHooks.configs.recommended
const CLASSIC_HOOK_RULES = new Set(['react-hooks/rules-of-hooks', 'react-hooks/exhaustive-deps'])
const hooksRules = Object.fromEntries(
  Object.entries(hooksPreset.rules).map(([name, level]) => [
    name,
    CLASSIC_HOOK_RULES.has(name) ? level : 'warn',
  ]),
)

export default [
  // mobile/ is the Expo app with its own TS toolchain — not linted from here
  { ignores: ['dist', 'mobile', 'coverage', 'reports'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh.plugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...hooksRules,
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z]' }],
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    // Build/config files run in Node (they read process.env, __dirname, etc.)
    files: ['*.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
]
