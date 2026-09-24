import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSettingsStore } from '../../src/store/settings';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setActivePinia(createPinia());
});

describe('token storage', () => {
  it('remembers a token in localStorage across store instances', () => {
    const first = useSettingsStore();
    first.setToken('secret-token');

    setActivePinia(createPinia());
    const second = useSettingsStore();
    expect(second.token).toBe('secret-token');
  });
});

describe('legacy settings blob', () => {
  it('silently ignores a stale debounceReorder key instead of erroring', () => {
    const first = useSettingsStore();
    first.updateRepoSettings({ owner: 'me', repo: 'learning-data', branch: 'main', path: 'learning.md' });
    const raw = JSON.parse(localStorage.getItem('learning-tracker:settings') ?? '{}') as Record<
      string,
      unknown
    >;
    raw['debounceReorder'] = false;
    localStorage.setItem('learning-tracker:settings', JSON.stringify(raw));

    setActivePinia(createPinia());
    expect(() => useSettingsStore()).not.toThrow();
    const second = useSettingsStore();
    expect(second.owner).toBe('me');
  });
});
