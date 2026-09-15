<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { makeHeadline, makeOptionalDescription } from '../domain/factories';
import { sectionOf, type Item, type Section } from '../domain/types';
import { highlightCodeBlocks, renderMarkdown } from '../markdown/render';

const { item } = defineProps<{ readonly item: Item }>();

const emit = defineEmits<{
  close: [];
  editHeadline: [headline: string];
  setDescription: [description: string];
  complete: [];
  uncomplete: [];
  discard: [];
  restore: [];
  delete: [];
}>();

const SECTION_LABEL: Record<Section, string> = {
  new: 'New',
  wip: 'WIP',
  complete: 'Complete',
  discarded: 'Discarded',
};

const statusLabel = computed(() => SECTION_LABEL[sectionOf(item)]);

const headlineDraft = ref(item.headline);
const descriptionDraft = ref<string>(item.description ?? '');
const descError = ref('');
const headlineError = ref('');
const livePreviewEl = ref<HTMLElement | null>(null);
const staticPreviewEl = ref<HTMLElement | null>(null);
const showDeleteConfirm = ref(false);
const descriptionEditing = ref(item.status !== 'complete');

const renderedHtml = computed(() => renderMarkdown(descriptionDraft.value));

watch(
  [renderedHtml, descriptionEditing],
  async () => {
    await nextTick();
    if (livePreviewEl.value) await highlightCodeBlocks(livePreviewEl.value);
    if (staticPreviewEl.value) await highlightCodeBlocks(staticPreviewEl.value);
  },
  { immediate: true },
);

watch(
  () => item.id,
  () => {
    headlineDraft.value = item.headline;
    descriptionDraft.value = item.description ?? '';
    descError.value = '';
    headlineError.value = '';
    showDeleteConfirm.value = false;
    descriptionEditing.value = item.status !== 'complete';
  },
);

function saveHeadline(): void {
  const result = makeHeadline(headlineDraft.value);
  if (!result.ok) {
    headlineError.value = 'Headline cannot be empty.';
    return;
  }
  headlineError.value = '';
  if (result.value !== item.headline) emit('editHeadline', result.value);
}

function saveDescription(): void {
  if (item.status === 'complete' && descriptionDraft.value.trim() === '') {
    descError.value = 'A completed item must keep a description.';
    return;
  }
  const result = makeOptionalDescription(descriptionDraft.value);
  if (!result.ok) {
    descError.value = 'That description cannot be stored (it contains the reserved end marker).';
    return;
  }
  descError.value = '';
  emit('setDescription', descriptionDraft.value);
}

function discardInstead(): void {
  showDeleteConfirm.value = false;
  emit('discard');
}

function confirmDelete(): void {
  showDeleteConfirm.value = false;
  emit('delete');
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    if (showDeleteConfirm.value) {
      showDeleteConfirm.value = false;
    } else {
      emit('close');
    }
  } else if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault();
    saveDescription();
  }
}
</script>

<template>
  <aside class="drawer" @keydown="onKeydown">
    <div class="drawer-header">
      <span class="status-badge" :class="sectionOf(item)">{{ statusLabel }}</span>
      <input v-model="headlineDraft" class="headline" @blur="saveHeadline" @keyup.enter="saveHeadline" />
      <button class="close" title="Close (Esc)" @click="emit('close')">✕</button>
    </div>
    <p v-if="headlineError" class="error">{{ headlineError }}</p>

    <dl class="dates">
      <dt>Created</dt>
      <dd>{{ item.createdAt }}</dd>
      <template v-if="item.status === 'complete'">
        <dt>Completed</dt>
        <dd>{{ item.completedAt }}</dd>
      </template>
      <template v-if="item.status === 'discarded'">
        <dt>Discarded</dt>
        <dd>{{ item.discardedAt }}</dd>
      </template>
    </dl>

    <h3>Description</h3>
    <!-- eslint-disable-next-line vue/no-v-html -- renderedHtml is DOMPurify-sanitized in markdown/render.ts -->
    <div v-if="!descriptionEditing" ref="staticPreviewEl" class="preview preview-static" title="Click to edit" @click="descriptionEditing = true" v-html="renderedHtml" />
    <template v-else>
      <div class="desc-editor">
        <textarea
          v-model="descriptionDraft"
          class="desc-input"
          placeholder="Notes, links, code — Markdown supported."
          @blur="saveDescription"
        />
        <!-- eslint-disable-next-line vue/no-v-html -- renderedHtml is DOMPurify-sanitized in markdown/render.ts -->
        <div ref="livePreviewEl" class="preview" v-html="renderedHtml" />
      </div>
      <div class="desc-actions">
        <button class="primary" @click="saveDescription">Send</button>
      </div>
    </template>
    <p v-if="descError" class="error">{{ descError }}</p>

    <h3>Actions</h3>
    <div class="actions">
      <button v-if="item.status === 'active'" :disabled="item.description === null" @click="emit('complete')">
        ✓ Complete
      </button>
      <button v-if="item.status === 'complete'" @click="emit('uncomplete')">↺ Reopen</button>
      <button v-if="item.status === 'discarded'" @click="emit('restore')">↩ Restore</button>
      <button v-if="item.status !== 'discarded'" class="danger" @click="emit('discard')">✕ Discard</button>
      <button class="danger" @click="showDeleteConfirm = true">🗑 Delete</button>
    </div>

    <div v-if="showDeleteConfirm" class="confirm-overlay">
      <div class="confirm-dialog">
        <h4>Delete "{{ item.headline }}"?</h4>
        <p>This permanently removes the item and its description. This cannot be undone.</p>
        <div class="confirm-actions">
          <button class="ghost" @click="showDeleteConfirm = false">Cancel</button>
          <button v-if="item.status !== 'discarded'" class="ghost" @click="discardInstead">✕ Discard instead</button>
          <button class="danger" @click="confirmDelete">Delete permanently</button>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: var(--drawer-width);
  background: var(--surface);
  border-left: 1px solid var(--border);
  padding: 1rem 1.2rem calc(1.2rem + env(safe-area-inset-bottom, 0px));
  padding-top: calc(1rem + env(safe-area-inset-top, 0px));
  overflow-y: auto;
  box-shadow: -4px 0 16px rgba(0, 0, 0, 0.08);
}

.drawer-header {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.status-badge {
  flex-shrink: 0;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.2em 0.6em;
  border-radius: 999px;
  background: var(--surface-alt);
}

.status-badge.new {
  color: var(--new);
}
.status-badge.wip {
  color: var(--wip);
}
.status-badge.complete {
  color: var(--complete);
}
.status-badge.discarded {
  color: var(--discarded);
}

.headline {
  flex: 1;
  font-size: 1.1rem;
  font-weight: 600;
}

.close {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  width: 2em;
  height: 2em;
  flex-shrink: 0;
}

.dates {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.2rem 0.6rem;
  font-size: 0.8rem;
  color: var(--text-muted);
  margin: 0.8rem 0;
}

.dates dt {
  font-weight: 600;
}

.dates dd {
  margin: 0;
}

h3 {
  margin: 1rem 0 0;
  font-size: 0.9rem;
}

.desc-editor {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.5rem;
}

.desc-input {
  flex: 0 1 80ch;
  min-width: 0;
  min-height: 16rem;
  font-family: 'SF Mono', Consolas, Menlo, monospace;
  font-size: 0.85rem;
  resize: vertical;
}

.preview {
  min-height: 16rem;
  overflow-wrap: anywhere;
  overflow-y: auto;
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.6rem;
}

.desc-editor .preview {
  flex: 0 1 80ch;
  min-width: 0;
}

.preview-static {
  margin-top: 0.5rem;
  cursor: text;
}

.preview :deep(pre) {
  overflow-x: auto;
  background: var(--surface);
  padding: 0.6rem;
  border-radius: 6px;
}

.desc-actions {
  display: flex;
  justify-content: flex-start;
  margin-top: 0.5rem;
}

.actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.actions button,
.desc-actions button {
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.4em 0.9em;
}

.actions button.danger {
  color: var(--danger);
}

.actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

button.primary {
  background: var(--accent);
  color: var(--accent-contrast);
  border: none;
}

.error {
  color: var(--danger);
  font-size: 0.8rem;
}

.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 100;
}

.confirm-dialog {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1.2rem;
  max-width: 34rem;
  width: 100%;
}

.confirm-dialog h4 {
  margin: 0 0 0.5rem;
}

.confirm-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: flex-end;
  margin-top: 1rem;
}

.confirm-actions button.ghost {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.4em 0.9em;
  color: var(--text);
}

.confirm-actions button.danger {
  background: var(--danger);
  color: var(--accent-contrast);
  border: none;
  border-radius: 6px;
  padding: 0.4em 0.9em;
}
</style>
