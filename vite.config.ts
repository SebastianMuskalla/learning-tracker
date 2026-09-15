import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

// GitHub Pages serves the project site under /<repo>/, so the base must match the repo name.
// Override with VITE_BASE when the repo is renamed or the site is served from the domain root.
export default defineConfig({
  base: process.env['VITE_BASE'] ?? '/learning-tracker/',
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
