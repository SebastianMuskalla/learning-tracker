<script setup lang="ts">
import { VueDraggable, type DraggableEvent } from 'vue-draggable-plus';
import { ref, watch } from 'vue';
import type { Item, ItemId, Section, Tag } from '../domain/types';
import ItemCard from './ItemCard.vue';

const { items, totalCount, filterActive, tags, dragDisabled } = defineProps<{
  readonly title: string;
  readonly section: Section;
  readonly items: readonly Item[];
  readonly totalCount: number;
  /** Whether a search or tag filter is currently active — determines the "x of y" header style
   *  even for a column the filter happens not to narrow. */
  readonly filterActive: boolean;
  /** The board's tag definitions, passed through to each card to resolve its tag colors. */
  readonly tags: readonly Tag[];
  readonly dragDisabled: boolean;
}>();

const emit = defineEmits<{
  reorder: [fromIndex: number, toIndex: number];
  select: [id: ItemId];
  complete: [id: ItemId];
  editHeadline: [id: ItemId, headline: string];
}>();

const localItems = ref<Item[]>([...items]);
watch(
  () => items,
  (next) => {
    localItems.value = [...next];
  },
);

function onUpdate(event: DraggableEvent<Item>): void {
  const from = event.oldIndex;
  const to = event.newIndex;
  if (typeof from === 'number' && typeof to === 'number' && from !== to) {
    emit('reorder', from, to);
  }
}
</script>

<template>
  <section class="column" :class="section">
    <div class="column-header">
      <h2>{{ title }}</h2>
      <span class="count" aria-live="polite">
        {{ filterActive ? `${items.length} of ${totalCount}` : items.length }}
      </span>
    </div>

    <VueDraggable
      v-model="localItems"
      tag="ul"
      class="list"
      :class="{ 'drag-disabled': dragDisabled }"
      handle=".handle"
      :animation="150"
      :disabled="dragDisabled"
      @update="onUpdate"
    >
      <ItemCard
        v-for="item in localItems"
        :key="item.id"
        :item="item"
        :section="section"
        :tags="tags"
        @select="emit('select', item.id)"
        @complete="emit('complete', item.id)"
        @edit-headline="(headline: string) => emit('editHeadline', item.id, headline)"
      />
    </VueDraggable>
  </section>
</template>

<style scoped>
.column {
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.75rem;
  min-width: 0;
}

.column.new {
  background: color-mix(in srgb, var(--new-tint) 14%, var(--surface-alt));
}

.column.wip {
  background: color-mix(in srgb, var(--wip-tint) 16%, var(--surface-alt));
}

.column.complete {
  background: color-mix(in srgb, var(--complete-tint) 16%, var(--surface-alt));
}

.column.discarded {
  background: color-mix(in srgb, var(--discarded-tint) 14%, var(--surface-alt));
}

.column-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.2rem 0;
}

.column-header h2 {
  font-size: 0.95rem;
  margin: 0;
  flex: 1;
}

.count {
  font-size: 0.8rem;
  color: var(--text-muted);
  background: var(--surface);
  border-radius: 999px;
  padding: 0.1em 0.6em;
}

.list {
  list-style: none;
  margin: 0.6rem 0 0;
  padding: 0;
  min-height: 0.5rem;
}

.list.drag-disabled :deep(.handle) {
  visibility: hidden;
}
</style>
