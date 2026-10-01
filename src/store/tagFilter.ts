import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { TagName } from '../domain/types';

const STORAGE_KEY = 'learning-tracker:active-tags';
const UNCATEGORIZED_STORAGE_KEY = 'learning-tracker:filter-uncategorized';

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

function loadUncategorized(): boolean {
  try {
    return localStorage.getItem(UNCATEGORIZED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function persistUncategorized(active: boolean): void {
  try {
    if (active) {
      localStorage.setItem(UNCATEGORIZED_STORAGE_KEY, 'true');
    } else {
      localStorage.removeItem(UNCATEGORIZED_STORAGE_KEY);
    }
  } catch {
    // Storage unavailable: the chip still works for this session, just not remembered.
  }
}

export const useTagFilterStore = defineStore('tagFilter', () => {
  const activeNames = ref<Set<TagName>>(loadPersisted());
  const uncategorizedActive = ref(loadUncategorized());
  const isActive = computed(() => activeNames.value.size > 0 || uncategorizedActive.value);

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

  function toggleUncategorized(): void {
    uncategorizedActive.value = !uncategorizedActive.value;
    persistUncategorized(uncategorizedActive.value);
  }

  function clearUncategorized(): void {
    uncategorizedActive.value = false;
    persistUncategorized(false);
  }

  function clear(): void {
    activeNames.value = new Set();
    persist(activeNames.value);
    clearUncategorized();
  }

  return {
    activeNames,
    uncategorizedActive,
    isActive,
    toggle,
    toggleUncategorized,
    clearUncategorized,
    clear,
  };
});
