import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';
import eslintConfigPrettier from 'eslint-config-prettier';
import pluginVue from 'eslint-plugin-vue';

export default defineConfigWithVueTs(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
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
    // Branded-type casts belong only in factories.ts. These files legitimately cast at a
    // system boundary instead (parsing JSON from `fetch`/`localStorage`), which the rule
    // above isn't meant to cover.
    files: [
      'src/domain/factories.ts',
      'src/domain/result.ts',
      'src/github/client.ts',
      'src/store/settings.ts',
      '**/*.test.ts',
      'tests/**/*.ts',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  eslintConfigPrettier,
);
