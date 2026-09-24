<script setup lang="ts">
import type { Tag } from '../domain/types';
import { useTagFilterStore } from '../store/tagFilter';
import TagChip from './TagChip.vue';

defineProps<{ readonly tags: readonly Tag[] }>();

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
</style>
