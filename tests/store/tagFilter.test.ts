// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTagName } from '../../src/domain/factories';
import { unwrap } from '../../src/domain/result';
import type { TagName } from '../../src/domain/types';
import { useTagFilterStore } from '../../src/store/tagFilter';

const STORAGE_KEY = 'learning-tracker:active-tags';
const UNCATEGORIZED_KEY = 'learning-tracker:filter-uncategorized';

function tagName(text: string): TagName {
  return unwrap(makeTagName(text));
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('toggle / clear', () => {
  it('toggle adds a name, then removes it', () => {
    const store = useTagFilterStore();
    const vue = tagName('vue');

    store.toggle(vue);
    expect(store.activeNames.has(vue)).toBe(true);
    expect(store.isActive).toBe(true);

    store.toggle(vue);
    expect(store.activeNames.has(vue)).toBe(false);
    expect(store.isActive).toBe(false);
  });

  it('clear empties the active set', () => {
    const store = useTagFilterStore();
    store.toggle(tagName('vue'));
    store.toggle(tagName('rust'));

    store.clear();

    expect(store.activeNames.size).toBe(0);
    expect(store.isActive).toBe(false);
  });
});

describe('persistence', () => {
  it('writes the active set to localStorage and a fresh store reads it back', () => {
    const first = useTagFilterStore();
    first.toggle(tagName('vue'));
    first.toggle(tagName('rust'));

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toEqual(['vue', 'rust']);

    setActivePinia(createPinia());
    const second = useTagFilterStore();
    expect([...second.activeNames].sort()).toEqual(['rust', 'vue']);
  });

  it('falls back to an empty set when the stored value is corrupt', () => {
    localStorage.setItem(STORAGE_KEY, 'not json');
    const store = useTagFilterStore();
    expect(store.activeNames.size).toBe(0);
    expect(store.isActive).toBe(false);
  });
});

describe('uncategorized chip', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('toggles and counts as an active filter', () => {
    const store = useTagFilterStore();
    expect(store.uncategorizedActive).toBe(false);
    store.toggleUncategorized();
    expect(store.uncategorizedActive).toBe(true);
    expect(store.isActive).toBe(true);
    store.toggleUncategorized();
    expect(store.isActive).toBe(false);
  });

  it('clear and clearUncategorized turn it off', () => {
    const store = useTagFilterStore();
    store.toggleUncategorized();
    store.clear();
    expect(store.uncategorizedActive).toBe(false);
    store.toggleUncategorized();
    store.clearUncategorized();
    expect(store.uncategorizedActive).toBe(false);
    expect(localStorage.getItem(UNCATEGORIZED_KEY)).toBeNull();
  });

  it('is remembered by a fresh store', () => {
    useTagFilterStore().toggleUncategorized();
    setActivePinia(createPinia());
    expect(useTagFilterStore().uncategorizedActive).toBe(true);
  });

  it('means "not active" for a corrupt stored value', () => {
    localStorage.setItem(UNCATEGORIZED_KEY, 'maybe');
    expect(useTagFilterStore().uncategorizedActive).toBe(false);
  });

  it('still works when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const store = useTagFilterStore();
    expect(store.uncategorizedActive).toBe(false);
    store.toggleUncategorized();
    expect(store.uncategorizedActive).toBe(true);
    store.clearUncategorized();
    expect(store.uncategorizedActive).toBe(false);
  });
});
