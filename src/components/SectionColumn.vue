<script setup lang="ts">
import { VueDraggable, type DraggableEvent } from 'vue-draggable-plus';
import { ref, watch } from 'vue';
import type { Item, ItemId, Section } from '../domain/types';
import ItemCard from './ItemCard.vue';

const { title, section, items } = defineProps<{
  readonly title: string;
  readonly section: Section;
  readonly items: readonly Item[];
}>();

const emit = defineEmits<{
  reorder: [fromIndex: number, toIndex: number];
  select: [id: ItemId];
  complete: [id: ItemId];
  uncomplete: [id: ItemId];
  discard: [id: ItemId];
  restore: [id: ItemId];
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

const collapsed = ref(section === 'complete' || section === 'discarded');
</script>

<template>
  <section class="column" :class="{ collapsed }">
    <button class="column-header" @click="collapsed = !collapsed">
      <span class="chevron" :class="{ collapsed }">▾</span>
      <h2>{{ title }}</h2>
      <span class="count">{{ items.length }}</span>
    </button>

    <VueDraggable
      v-if="!collapsed"
      v-model="localItems"
      tag="ul"
      class="list"
      handle=".handle"
      :animation="150"
      @update="onUpdate"
    >
      <ItemCard
        v-for="item in localItems"
        :key="item.id"
        :item="item"
        :section="section"
        @select="emit('select', item.id)"
        @complete="emit('complete', item.id)"
        @uncomplete="emit('uncomplete', item.id)"
        @discard="emit('discard', item.id)"
        @restore="emit('restore', item.id)"
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

.column-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  background: transparent;
  border: none;
  padding: 0.2rem 0;
  text-align: left;
  color: var(--text);
}

.column-header h2 {
  font-size: 0.95rem;
  margin: 0;
  flex: 1;
}

.chevron {
  transition: transform 0.15s ease;
  color: var(--text-muted);
}

.chevron.collapsed {
  transform: rotate(-90deg);
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
</style>
