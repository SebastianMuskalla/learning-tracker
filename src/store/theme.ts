import { defineStore } from 'pinia';
import { ref } from 'vue';

/** `system` follows the device setting (light if the device states no preference). */
export type ThemeMode = 'system' | 'light' | 'dark';

export const THEME_MODES: readonly ThemeMode[] = ['system', 'light', 'dark'];

const STORAGE_KEY = 'learning-tracker:theme';

function isThemeMode(value: unknown): value is ThemeMode {
  return THEME_MODES.some((mode) => mode === value);
}

function loadPersisted(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isThemeMode(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

function persist(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Storage full or unavailable: the mode still applies for this session, just not remembered.
  }
}

/**
 * Sets `data-theme` on `<html>`. The palette in src/styles/base.css reads it through
 * `color-scheme`; without the attribute, the browser picks light or dark from the device setting.
 */
function apply(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === 'system') {
    delete root.dataset['theme'];
  } else {
    root.dataset['theme'] = mode;
  }
}

export const useThemeStore = defineStore('theme', () => {
  const mode = ref<ThemeMode>(loadPersisted());
  apply(mode.value);

  function setMode(next: ThemeMode): void {
    mode.value = next;
    apply(next);
    persist(next);
  }

  return { mode, setMode };
});
