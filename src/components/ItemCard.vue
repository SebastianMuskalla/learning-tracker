<script setup lang="ts">
import { ref } from 'vue';
import { makeHeadline } from '../domain/factories';
import type { Item, Section } from '../domain/types';

const { item, section } = defineProps<{
  readonly item: Item;
  readonly section: Section;
}>();

const emit = defineEmits<{
  select: [];
  complete: [];
  uncomplete: [];
  discard: [];
  restore: [];
  editHeadline: [headline: string];
}>();

const editing = ref(false);
const draft = ref(item.headline);
const editError = ref('');

function startEdit(event: MouseEvent): void {
  event.stopPropagation();
  draft.value = item.headline;
  editError.value = '';
  editing.value = true;
}

function commitEdit(): void {
  const result = makeHeadline(draft.value);
  if (!result.ok) {
    editError.value = 'Headline cannot be empty.';
    return;
  }
  editing.value = false;
  if (result.value !== item.headline) {
    emit('editHeadline', result.value);
  }
}

function cancelEdit(): void {
  editing.value = false;
}
</script>

<template>
  <li class="card" :class="section" @click="emit('select')">
    <span class="handle" title="Drag to reorder" @click.stop>⠿</span>

    <div class="body">
      <input
        v-if="editing"
        v-model="draft"
        class="headline-input"
        autofocus
        @click.stop
        @keyup.enter="commitEdit"
        @keyup.esc="cancelEdit"
        @blur="commitEdit"
      />
      <span v-else class="headline" @dblclick="startEdit">{{ item.headline }}</span>
      <p v-if="editError" class="edit-error">{{ editError }}</p>

      <div class="meta">
        <span class="badge">{{ section }}</span>
        <span v-if="item.status === 'complete'" class="date">done {{ item.completedAt }}</span>
        <span v-else-if="item.status === 'discarded'" class="date">discarded {{ item.discardedAt }}</span>
        <span v-else class="date">created {{ item.createdAt }}</span>
      </div>
    </div>

    <div class="actions" @click.stop>
      <button v-if="section === 'wip'" title="Complete" @click="emit('complete')">✓</button>
      <button v-if="section === 'complete'" title="Reopen" @click="emit('uncomplete')">↺</button>
      <button v-if="section === 'discarded'" title="Restore" @click="emit('restore')">↩</button>
      <button v-if="section !== 'discarded'" title="Discard" class="danger" @click="emit('discard')">✕</button>
    </div>
  </li>
</template>

<style scoped>
.card {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.6rem 0.7rem;
  margin-bottom: 0.5rem;
  cursor: pointer;
}

.handle {
  color: var(--text-muted);
  cursor: grab;
  padding-top: 0.1rem;
}

.body {
  flex: 1;
  min-width: 0;
}

.headline {
  display: block;
  word-break: break-word;
}

.headline-input {
  width: 100%;
}

.edit-error {
  color: var(--danger);
  font-size: 0.75rem;
  margin: 0.2rem 0 0;
}

.meta {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.35rem;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.badge {
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.card.new .badge {
  color: var(--new);
}
.card.wip .badge {
  color: var(--wip);
}
.card.complete .badge {
  color: var(--complete);
}
.card.discarded .badge {
  color: var(--discarded);
}

.actions {
  display: flex;
  gap: 0.3rem;
}

.actions button {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 5px;
  width: 1.8em;
  height: 1.8em;
  line-height: 1;
}

.actions button.danger {
  color: var(--danger);
}
</style>
