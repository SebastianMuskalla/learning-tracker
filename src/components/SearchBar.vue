<script setup lang="ts">
import { ref } from 'vue';
import { useSearchStore } from '../store/search';

defineProps<{
  readonly matchCount: number;
  readonly totalCount: number;
}>();

const searchStore = useSearchStore();
const inputEl = ref<HTMLInputElement | null>(null);

function focus(): void {
  inputEl.value?.focus();
  inputEl.value?.select();
}

function hasFocus(): boolean {
  return inputEl.value !== null && document.activeElement === inputEl.value;
}

function clear(): void {
  searchStore.clear();
  inputEl.value?.focus();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  // Keep the global handler from also treating this Escape as "close the drawer".
  event.stopPropagation();
  if (searchStore.term !== '') {
    searchStore.clear();
  } else {
    inputEl.value?.blur();
  }
}

defineExpose({ focus, hasFocus });
</script>

<template>
  <div class="search-bar">
    <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
    <input
      ref="inputEl"
      v-model="searchStore.term"
      type="text"
      class="input"
      aria-label="Search items"
      placeholder="Search (Ctrl+F)"
      @keydown="onKeydown"
    />
    <span v-if="searchStore.isActive" class="count" aria-live="polite">{{ matchCount }} out of {{ totalCount }} items</span>
    <button v-if="searchStore.isActive" class="clear" title="Clear search" @click="clear">
      <i class="fa-solid fa-xmark" aria-hidden="true"></i>
    </button>
  </div>
</template>

<style scoped>
.search-bar {
  position: fixed;
  left: 1rem;
  bottom: 1rem;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  max-width: calc(100vw - 2rem);
  padding: 0.5rem 0.8rem;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  font-size: 0.8rem;
  color: var(--text-muted);
}

.input {
  flex: 1 1 10rem;
  min-width: 6rem;
  border: none;
  padding: 0;
  font-size: inherit;
  background: transparent;
}

.input:focus {
  outline: none;
}

.count {
  flex-shrink: 0;
  white-space: nowrap;
}

.clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: transparent;
  border: none;
  color: inherit;
  width: 1.6em;
  height: 1.6em;
  line-height: 1;
}

/* Keep the search bar and the sync overlay from overlapping on narrow screens: stack the search
 * bar above the overlay instead of letting the two fixed boxes collide in the bottom corners. */
@media (max-width: 40rem) {
  .search-bar {
    bottom: 4.5rem;
  }
}
</style>
