// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('unusable stored settings (E6)', () => {
  const cases: readonly (readonly [label: string, raw: string])[] = [
    ['an empty object', '{}'],
    ['null', 'null'],
    ['non-string fields', JSON.stringify({ owner: 1, repo: true, branch: null, path: [] })],
    ['an empty owner', JSON.stringify({ owner: '', repo: 'r', branch: 'main', path: 'learning.md' })],
    ['text that is not JSON', '{not json'],
  ];

  for (const [label, raw] of cases) {
    it(`falls back to the defaults for ${label}`, () => {
      localStorage.setItem('learning-tracker:settings', raw);

      const settings = useSettingsStore();

      expect(settings.owner).toBe('');
      expect(settings.branch).toBe('main');
      expect(settings.path).toBe('learning.md');
      expect(settings.isRepoConfigured).toBe(false);
    });
  }
});

describe('blocked storage (E6)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with the defaults when reading storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });

    const settings = useSettingsStore();

    expect(settings.owner).toBe('');
    expect(settings.token).toBeNull();
  });

  it('keeps the token in memory and reports it when storing throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    const settings = useSettingsStore();

    expect(settings.setToken('secret')).toBe(false);
    expect(settings.token).toBe('secret');
    expect(settings.updateRepoSettings({ owner: 'me', repo: 'r', branch: 'main', path: 'learning.md' })).toBe(
      false,
    );
    expect(settings.owner).toBe('me');
  });
});
