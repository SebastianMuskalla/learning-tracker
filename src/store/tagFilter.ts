import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { TagName } from '../domain/types';

const STORAGE_KEY = 'learning-tracker:active-tags';

function loadPersisted(): Set<TagName> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === 'string')) return new Set();
    // eslint-disable-next-line no-restricted-syntax -- reading a branded type back from storage
    return new Set(parsed as TagName[]);
  } catch {
    return new Set();
  }
}

function persist(names: ReadonlySet<TagName>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...names]));
  } catch {
    // Storage full or unavailable: the filter still works for this session, just not remembered.
  }
}

export const useTagFilterStore = defineStore('tagFilter', () => {
  const activeNames = ref<Set<TagName>>(loadPersisted());
  const isActive = computed(() => activeNames.value.size > 0);

  function toggle(name: TagName): void {
    const next = new Set(activeNames.value);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    activeNames.value = next;
    persist(next);
  }

  function clear(): void {
    activeNames.value = new Set();
    persist(activeNames.value);
  }

  return { activeNames, isActive, toggle, clear };
});
