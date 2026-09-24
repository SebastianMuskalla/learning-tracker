import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

// GitHub Pages serves the project site under /<repo>/, so the base must match the repo name.
// Override with VITE_BASE when the repo is renamed or the site is served from the domain root.
const viteBase = process.env['VITE_BASE'];

export default defineConfig({
  base: viteBase === undefined || viteBase === '' ? '/learning-tracker/' : viteBase,
  plugins: [vue()],
  test: {
    // Most tests need no DOM. A test file that needs one starts with `// @vitest-environment jsdom`.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // Just below the current numbers. Raise them when the coverage goes up.
      thresholds: { lines: 80, statements: 79, functions: 74, branches: 68 },
    },
  },
});
