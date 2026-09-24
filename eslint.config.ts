import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';
import vitest from '@vitest/eslint-plugin';
import eslintConfigPrettier from 'eslint-config-prettier';
import pluginVue from 'eslint-plugin-vue';

export default defineConfigWithVueTs(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  {
    // Make these errors on their own, not only through the CLI's --max-warnings 0.
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
      reportUnusedInlineConfigs: 'error',
    },
  },
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.strictTypeChecked,
  vueTsConfigs.stylisticTypeChecked,
  {
    rules: {
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      // Keep in sync with tsconfig's noPropertyAccessFromIndexSignature, which forces bracket
      // access for index-signature properties like process.env.FOO.
      '@typescript-eslint/dot-notation': ['error', { allowIndexSignaturePropertyAccess: true }],
      'vue/block-lang': ['error', { script: { lang: 'ts' } }],
      'vue/block-order': ['error', { order: ['script', 'template', 'style'] }],
      'vue/define-macros-order': 'error',
      'vue/no-undef-components': 'error',
      'vue/no-unused-properties': 'error',
      'vue/no-unused-refs': 'error',
      'vue/no-useless-v-bind': 'error',
      'vue/require-typed-ref': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAsExpression',
          message:
            'Avoid `as` casts outside src/domain/factories.ts; use a validated factory or type narrowing instead.',
        },
      ],
    },
  },
  {
    // Branded-type casts belong only in factories.ts. Data from outside (`fetch`, `localStorage`)
    // is checked with type guards instead. Anywhere else, use an inline disable with a reason.
    // Tests build fixtures with casts on purpose.
    files: ['src/domain/factories.ts', 'tests/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['tests/**/*.ts'],
    ...vitest.configs.recommended,
    rules: {
      ...vitest.configs.recommended.rules,
      // Some tests check for unexpected console output after each test.
      'vitest/no-standalone-expect': ['error', { additionalTestBlockFunctions: ['afterEach'] }],
      // A fast-check property that returns false fails the test, like a failed `expect`.
      'vitest/expect-expect': ['error', { assertFunctionNames: ['expect', 'fc.assert'] }],
    },
  },
  eslintConfigPrettier,
);
