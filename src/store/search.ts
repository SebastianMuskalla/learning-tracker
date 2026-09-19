import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { normalize } from '../search/match';

export const useSearchStore = defineStore('search', () => {
  const term = ref('');
  const normalizedTerm = computed(() => normalize(term.value).text);
  const isActive = computed(() => term.value !== '');

  function clear(): void {
    term.value = '';
  }

  return { term, normalizedTerm, isActive, clear };
});
