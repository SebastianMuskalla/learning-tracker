import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSettingsStore } from '../../src/store/settings';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setActivePinia(createPinia());
});

describe('token storage modes', () => {
  it('remembers a token in localStorage across store instances', async () => {
    const first = useSettingsStore();
    await first.setToken('secret-token', 'local');

    setActivePinia(createPinia());
    const second = useSettingsStore();
    expect(second.token).toBe('secret-token');
    expect(second.tokenStorageMode).toBe('local');
  });

  it('keeps a session token out of localStorage', async () => {
    const store = useSettingsStore();
    await store.setToken('secret-token', 'session');

    expect(localStorage.getItem('learning-tracker:token')).toBeNull();
    expect(sessionStorage.getItem('learning-tracker:token')).toBe('secret-token');
  });

  it('encrypts a passphrase-protected token so it is not readable in localStorage', async () => {
    const store = useSettingsStore();
    await store.setToken('secret-token', 'passphrase', 'correct horse battery staple');

    const raw = localStorage.getItem('learning-tracker:token-encrypted');
    expect(raw).not.toBeNull();
    expect(raw).not.toContain('secret-token');
  });

  it('unlocks a passphrase-protected token with the right passphrase, and rejects the wrong one', async () => {
    const first = useSettingsStore();
    await first.setToken('secret-token', 'passphrase', 'correct horse battery staple');

    setActivePinia(createPinia());
    const second = useSettingsStore();
    expect(second.needsPassphrase).toBe(true);
    expect(second.token).toBeNull();

    expect(await second.unlockWithPassphrase('wrong passphrase')).toBe(false);
    expect(await second.unlockWithPassphrase('correct horse battery staple')).toBe(true);
    expect(second.token).toBe('secret-token');
  });
});

describe('clearToken', () => {
  it('removes the token from every storage location', async () => {
    const store = useSettingsStore();
    await store.setToken('secret-token', 'local');
    store.clearToken();

    expect(store.token).toBeNull();
    expect(localStorage.getItem('learning-tracker:token')).toBeNull();
  });
});

describe('debounceReorder', () => {
  it('defaults to true and persists across store instances once changed', () => {
    const first = useSettingsStore();
    expect(first.debounceReorder).toBe(true);
    first.setDebounceReorder(false);

    setActivePinia(createPinia());
    const second = useSettingsStore();
    expect(second.debounceReorder).toBe(false);
  });

  it('defaults to true for a settings blob saved before this option existed', () => {
    const first = useSettingsStore();
    first.updateRepoSettings({ owner: 'me', repo: 'learning-data', branch: 'main', path: 'learning.md' });
    const raw = JSON.parse(localStorage.getItem('learning-tracker:settings') ?? '{}') as Record<string, unknown>;
    delete raw['debounceReorder'];
    localStorage.setItem('learning-tracker:settings', JSON.stringify(raw));

    setActivePinia(createPinia());
    const second = useSettingsStore();
    expect(second.debounceReorder).toBe(true);
  });
});
