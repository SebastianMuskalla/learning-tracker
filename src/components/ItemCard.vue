<script setup lang="ts">
import { computed, ref } from 'vue';
import { makeHeadline } from '../domain/factories';
import { renderMarkdown } from '../markdown/render';
import type { Item, Section } from '../domain/types';

const { item, section } = defineProps<{
  readonly item: Item;
  readonly section: Section;
}>();

const emit = defineEmits<{
  select: [];
  complete: [];
  editHeadline: [headline: string];
}>();

const editing = ref(false);
const draft = ref(item.headline);
const editError = ref('');

const descriptionPreviewHtml = computed(() =>
  item.description !== null ? renderMarkdown(item.description) : null,
);

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

      <!-- eslint-disable-next-line vue/no-v-html -- descriptionPreviewHtml is DOMPurify-sanitized in markdown/render.ts -->
      <div v-if="descriptionPreviewHtml" class="desc-preview" v-html="descriptionPreviewHtml" />
    </div>

    <div class="actions" @click.stop>
      <button v-if="section === 'wip'" title="Complete" @click="emit('complete')">
        <i class="fa-solid fa-check" aria-hidden="true"></i>
      </button>
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

.desc-preview {
  margin-top: 0.35rem;
  font-size: 0.8rem;
  line-height: 1.4em;
  color: var(--text-muted);
  max-height: calc(1.4em * 4);
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to bottom, black 0%, black 70%, transparent 100%);
  mask-image: linear-gradient(to bottom, black 0%, black 70%, transparent 100%);
}

.desc-preview :deep(p) {
  margin: 0 0 0.3em;
}

.desc-preview :deep(pre) {
  white-space: pre-wrap;
  word-break: break-word;
}

.actions {
  display: flex;
  gap: 0.3rem;
}

.actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 5px;
  width: 1.8em;
  height: 1.8em;
  line-height: 1;
}
</style>
