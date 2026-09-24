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

// Kept only in memory on purpose: every reload starts with all sections expanded. The column stays
// mounted while search and tag filters change, so this survives filtering.
const collapsed = ref(false);

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
  <section class="column" :class="[section, { collapsed }]">
    <h2 class="column-header">
      <button type="button" class="toggle" :aria-expanded="!collapsed" @click="collapsed = !collapsed">
        <i
          class="fa-solid chevron"
          :class="collapsed ? 'fa-chevron-right' : 'fa-chevron-down'"
          aria-hidden="true"
        ></i>
        <span class="title">{{ title }}</span>
        <span class="count" aria-live="polite">
          {{ filterActive ? `${items.length} of ${totalCount}` : items.length }}
        </span>
      </button>
    </h2>

    <VueDraggable
      v-show="!collapsed"
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

.column.collapsed {
  padding-top: 0.35rem;
  padding-bottom: 0.35rem;
}

.column-header {
  font-size: 0.95rem;
  margin: 0;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.2rem 0;
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.chevron {
  width: 0.8em;
  font-size: 0.75em;
  color: var(--text-muted);
}

.title {
  flex: 1;
}

.count {
  font-weight: normal;
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
