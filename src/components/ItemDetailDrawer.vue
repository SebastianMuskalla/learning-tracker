<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { makeHeadline, makeOptionalDescription } from '../domain/factories';
import type { Item } from '../domain/types';
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
}>();

const headlineDraft = ref(item.headline);
const descriptionDraft = ref<string>(item.description ?? '');
const mode = ref<'edit' | 'preview'>('edit');
const descError = ref('');
const headlineError = ref('');
const previewEl = ref<HTMLElement | null>(null);
const renderedHtml = ref('');

watch(
  () => item.id,
  () => {
    headlineDraft.value = item.headline;
    descriptionDraft.value = item.description ?? '';
    mode.value = 'edit';
    descError.value = '';
    headlineError.value = '';
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

async function togglePreview(): Promise<void> {
  if (mode.value === 'edit') {
    renderedHtml.value = renderMarkdown(descriptionDraft.value);
    mode.value = 'preview';
    await nextTick();
    if (previewEl.value) await highlightCodeBlocks(previewEl.value);
  } else {
    mode.value = 'edit';
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('close');
  } else if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault();
    saveDescription();
  }
}
</script>

<template>
  <aside class="drawer" @keydown="onKeydown">
    <div class="drawer-header">
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

    <div class="desc-toolbar">
      <h3>Description</h3>
      <button @click="togglePreview">{{ mode === 'edit' ? 'Preview' : 'Edit' }}</button>
    </div>

    <textarea
      v-if="mode === 'edit'"
      v-model="descriptionDraft"
      rows="12"
      placeholder="Notes, links, code — Markdown supported. Ctrl+S to save."
      @blur="saveDescription"
    />
    <!-- eslint-disable-next-line vue/no-v-html -- renderedHtml is DOMPurify-sanitized in markdown/render.ts -->
    <div v-else ref="previewEl" class="preview" v-html="renderedHtml" />
    <p v-if="descError" class="error">{{ descError }}</p>

    <div class="actions">
      <button v-if="item.status === 'active' && item.description !== null" @click="emit('complete')">Complete</button>
      <button v-if="item.status === 'complete'" @click="emit('uncomplete')">Reopen</button>
      <button v-if="item.status === 'discarded'" @click="emit('restore')">Restore</button>
      <button v-if="item.status !== 'discarded'" class="danger" @click="emit('discard')">Discard</button>
    </div>
  </aside>
</template>

<style scoped>
.drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(28rem, 100vw);
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

.desc-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 1rem;
}

.desc-toolbar h3 {
  margin: 0;
  font-size: 0.9rem;
}

textarea {
  width: 100%;
  margin-top: 0.5rem;
  font-family: 'SF Mono', Consolas, Menlo, monospace;
  font-size: 0.85rem;
  resize: vertical;
}

.preview {
  margin-top: 0.5rem;
  overflow-wrap: anywhere;
}

.preview :deep(pre) {
  overflow-x: auto;
  background: var(--surface-alt);
  padding: 0.6rem;
  border-radius: 6px;
}

.actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1.2rem;
  flex-wrap: wrap;
}

.actions button {
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.4em 0.9em;
}

.actions button.danger {
  color: var(--danger);
}

.error {
  color: var(--danger);
  font-size: 0.8rem;
}
</style>
