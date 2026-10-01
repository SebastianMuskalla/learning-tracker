<script setup lang="ts">
import { RESERVED_TAG_NAME } from '../domain/factories';
import type { Tag } from '../domain/types';
import { useTagFilterStore } from '../store/tagFilter';
import TagChip from './TagChip.vue';

defineProps<{
  readonly tags: readonly Tag[];
  /** True if at least one item has no tags. Then the "Uncategorized" chip is shown. */
  readonly showUncategorized: boolean;
}>();

const tagFilterStore = useTagFilterStore();
</script>

<template>
  <div class="tag-filter-bar" aria-label="Filter by tag">
    <TagChip
      v-for="tag in tags"
      :key="tag.name"
      :name="tag.name"
      :color="tag.color"
      :mode="tagFilterStore.activeNames.has(tag.name) ? 'active' : 'normal'"
      interactive
      @click="tagFilterStore.toggle(tag.name)"
    />
    <TagChip
      v-if="showUncategorized"
      class="uncategorized-chip"
      :name="RESERVED_TAG_NAME"
      color="var(--uncategorized-bg)"
      ink="var(--uncategorized-ink)"
      :mode="tagFilterStore.uncategorizedActive ? 'active' : 'normal'"
      interactive
      @click="tagFilterStore.toggleUncategorized()"
    />
  </div>
</template>

<style scoped>
.tag-filter-bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.75rem 1rem;
  max-width: 48rem;
  margin: 0 auto;
  width: 100%;
}

.uncategorized-chip {
  border-color: var(--text-muted);
}
</style>
