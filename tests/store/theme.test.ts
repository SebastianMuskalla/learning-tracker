// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useThemeStore } from '../../src/store/theme';

const STORAGE_KEY = 'learning-tracker:theme';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset['theme'];
  setActivePinia(createPinia());
});

describe('theme store', () => {
  it('follows the device theme by default and sets no data-theme attribute', () => {
    const theme = useThemeStore();
    expect(theme.mode).toBe('device');
    expect(document.documentElement.dataset['theme']).toBeUndefined();
  });

  it('sets data-theme when a fixed mode is chosen and removes it again for the device mode', () => {
    const theme = useThemeStore();
    theme.setMode('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    theme.setMode('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    theme.setMode('device');
    expect(document.documentElement.dataset['theme']).toBeUndefined();
  });

  it('remembers the chosen mode across store instances and applies it on load', () => {
    useThemeStore().setMode('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');

    delete document.documentElement.dataset['theme'];
    setActivePinia(createPinia());
    const second = useThemeStore();
    expect(second.mode).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it.each(['sepia', 'system'])('falls back to the device mode for the stored value %s', (value) => {
    localStorage.setItem(STORAGE_KEY, value);
    const theme = useThemeStore();
    expect(theme.mode).toBe('device');
    expect(document.documentElement.dataset['theme']).toBeUndefined();
  });
});
