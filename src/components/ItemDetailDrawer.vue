<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { makeHeadline, makeOptionalDescription } from '../domain/factories';
import { sectionOf, type Item, type ItemId, type Section, type Tag, type TagName } from '../domain/types';
import { formatTimestamp } from '../format/displayTimestamp';
import { highlightCodeBlocks, renderMarkdown } from '../markdown/render';
import { markHits } from '../search/markDom';
import { useBoardStore } from '../store/board';
import { useSearchStore } from '../store/search';
import ModalDialog from './ModalDialog.vue';
import TagChip from './TagChip.vue';

const { item, tags } = defineProps<{ readonly item: Item; readonly tags: readonly Tag[] }>();

// Every event names the item. A draft can then still be saved for the right item after the
// parent has already switched to another one.
const emit = defineEmits<{
  close: [];
  editHeadline: [id: ItemId, headline: string];
  setDescription: [id: ItemId, description: string];
  complete: [id: ItemId];
  uncomplete: [id: ItemId];
  discard: [id: ItemId];
  restore: [id: ItemId];
  delete: [id: ItemId];
  toggleTag: [id: ItemId, tag: TagName];
}>();

const SECTION_LABEL: Record<Section, string> = {
  new: 'New',
  wip: 'WIP',
  complete: 'Complete',
  discarded: 'Discarded',
};

const statusLabel = computed(() => SECTION_LABEL[sectionOf(item)]);
const searchStore = useSearchStore();
const boardStore = useBoardStore();

const headlineDraft = ref<string>(item.headline);
const descriptionDraft = ref<string>(item.description ?? '');
const descError = ref('');
const headlineError = ref('');
/** Set when the stored value changed (for example, after a merge) while the draft had changes. */
const headlineChangedElsewhere = ref(false);
const descriptionChangedElsewhere = ref(false);
const livePreviewEl = ref<HTMLElement | null>(null);
const staticPreviewEl = ref<HTMLElement | null>(null);
const showDeleteConfirm = ref(false);
const descriptionEditing = ref(item.status !== 'complete');
/** True once the drawer is being removed. Its drafts are saved then, and never again. */
let unmounting = false;

/** The value a draft would be stored as. Used to compare a draft with the stored value. */
function normalizedHeadline(draft: string): string {
  const result = makeHeadline(draft);
  return result.ok ? result.value : draft.trim();
}

function normalizedDescription(draft: string): string {
  const result = makeOptionalDescription(draft);
  return result.ok ? (result.value ?? '') : draft;
}

const headlineDirty = computed(() => normalizedHeadline(headlineDraft.value) !== item.headline);
const descriptionDirty = computed(
  () => normalizedDescription(descriptionDraft.value) !== (item.description ?? ''),
);

// Tell the store about drafts that are not saved yet, so that closing the tab asks first.
watch(headlineDirty, (dirty) => {
  boardStore.setDraftDirty('drawer-headline', dirty);
});
watch(descriptionDirty, (dirty) => {
  boardStore.setDraftDirty('drawer-description', dirty);
});

const renderedHtml = computed(() => renderMarkdown(descriptionDraft.value));

async function refreshHighlights(): Promise<void> {
  await nextTick();
  if (livePreviewEl.value) {
    await highlightCodeBlocks(livePreviewEl.value);
    markHits(livePreviewEl.value, searchStore.term);
  }
  if (staticPreviewEl.value) {
    await highlightCodeBlocks(staticPreviewEl.value);
    markHits(staticPreviewEl.value, searchStore.term);
  }
}

function scrollFirstMarkIntoView(): void {
  if (!searchStore.isActive) return;
  const container = descriptionEditing.value ? livePreviewEl.value : staticPreviewEl.value;
  const firstMark = container?.querySelector('mark.search-hit');
  if (firstMark instanceof HTMLElement) {
    firstMark.scrollIntoView({ block: 'center' });
  }
}

// Marks are refreshed whenever the rendered content, the edit/preview toggle, or the search term
// changes. Scrolling the first hit into view, though, only happens when the drawer opens (on the
// first, immediate run, `oldTerm`/`oldId` are `undefined`) or the search term itself changes — not
// on every content edit, which would otherwise yank the scroll position around while typing.
watch(
  [renderedHtml, descriptionEditing, () => searchStore.term, () => item.id],
  async ([, , newTerm, newId], [, , oldTerm, oldId]) => {
    const shouldScroll = newTerm !== oldTerm || newId !== oldId;
    await refreshHighlights();
    if (shouldScroll) scrollFirstMarkIntoView();
  },
  { immediate: true },
);

watch(
  (): readonly [ItemId, string, string] => [item.id, item.headline, item.description ?? ''],
  ([id, headline, description], [oldId, oldHeadline, oldDescription]) => {
    if (id !== oldId) {
      // Another item was selected. Save the drafts of the previous one first.
      saveDraftsFor(oldId, oldHeadline, oldDescription);
      headlineDraft.value = headline;
      descriptionDraft.value = description;
      descError.value = '';
      headlineError.value = '';
      headlineChangedElsewhere.value = false;
      descriptionChangedElsewhere.value = false;
      showDeleteConfirm.value = false;
      descriptionEditing.value = item.status !== 'complete';
      return;
    }

    // The same item changed in the store, for example after a merge with a change from GitHub.
    // A draft without changes follows the stored value. A draft with changes is kept, and the
    // user is told (unless the new stored value is the draft itself, which is our own save).
    const headlineNow = normalizedHeadline(headlineDraft.value);
    if (headlineNow === oldHeadline) {
      headlineDraft.value = headline;
    } else if (headlineNow !== headline) {
      headlineChangedElsewhere.value = true;
    }
    const descriptionNow = normalizedDescription(descriptionDraft.value);
    if (descriptionNow === oldDescription) {
      descriptionDraft.value = description;
    } else if (descriptionNow !== description) {
      descriptionChangedElsewhere.value = true;
    }
  },
);

/** Saves drafts with changes. `headline`/`description` are the stored values the drafts are
 *  compared with. */
function saveDraftsFor(id: ItemId, headline: string, description: string): void {
  const headlineResult = makeHeadline(headlineDraft.value);
  if (headlineResult.ok && headlineResult.value !== headline) {
    emit('editHeadline', id, headlineResult.value);
  }
  if (normalizedDescription(descriptionDraft.value) !== description) {
    emit('setDescription', id, descriptionDraft.value);
  }
}

function saveDrafts(): void {
  if (unmounting) return;
  saveDraftsFor(item.id, item.headline, item.description ?? '');
}

// Every way of closing the drawer (Escape, the X button, selecting nothing, deleting) unmounts it,
// so this is the one place that saves the drafts on close.
onBeforeUnmount(() => {
  saveDrafts();
  // A `blur` that the browser fires while the elements are removed must not save a second time.
  unmounting = true;
  boardStore.setDraftDirty('drawer-headline', false);
  boardStore.setDraftDirty('drawer-description', false);
});

function saveHeadline(): void {
  if (unmounting) return;
  const result = makeHeadline(headlineDraft.value);
  if (!result.ok) {
    headlineError.value = 'Headline cannot be empty.';
    return;
  }
  headlineError.value = '';
  headlineChangedElsewhere.value = false;
  if (result.value !== item.headline) emit('editHeadline', item.id, result.value);
}

function saveDescription(): void {
  if (unmounting) return;
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
  descriptionChangedElsewhere.value = false;
  // No command (and no line in the commit message) when nothing changed.
  if ((result.value ?? '') !== (item.description ?? ''))
    emit('setDescription', item.id, descriptionDraft.value);
}

function useStoredHeadline(): void {
  headlineDraft.value = item.headline;
  headlineChangedElsewhere.value = false;
}

function useStoredDescription(): void {
  descriptionDraft.value = item.description ?? '';
  descriptionChangedElsewhere.value = false;
}

function close(): void {
  emit('close');
}

function discardInstead(): void {
  showDeleteConfirm.value = false;
  emit('discard', item.id);
}

function confirmDelete(): void {
  showDeleteConfirm.value = false;
  // The item goes away, so its drafts must not be saved when the drawer unmounts.
  headlineDraft.value = item.headline;
  descriptionDraft.value = item.description ?? '';
  emit('delete', item.id);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    close();
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
      <button class="close" title="Close (Esc)" aria-label="Close" @click="close">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
    </div>
    <p v-if="headlineError" class="error">{{ headlineError }}</p>
    <p v-if="headlineChangedElsewhere" class="changed-elsewhere">
      This headline changed on GitHub.
      <button type="button" class="ghost" @click="useStoredHeadline">Use theirs</button>
      <button type="button" class="ghost" @click="saveHeadline">Keep mine</button>
    </p>

    <dl class="dates">
      <dt>Created</dt>
      <dd>{{ formatTimestamp(item.createdAt) }}</dd>
      <template v-if="item.status === 'complete'">
        <dt>Completed</dt>
        <dd>{{ formatTimestamp(item.completedAt) }}</dd>
      </template>
      <template v-if="item.status === 'discarded'">
        <dt>Discarded</dt>
        <dd>{{ formatTimestamp(item.discardedAt) }}</dd>
      </template>
    </dl>

    <div class="tags">
      <template v-if="tags.length > 0">
        <TagChip
          v-for="tag in tags"
          :key="tag.name"
          :name="tag.name"
          :color="tag.color"
          :mode="item.tags.includes(tag.name) ? 'normal' : 'muted'"
          interactive
          @click="emit('toggleTag', item.id, tag.name)"
        />
      </template>
      <p v-else class="hint">No tags yet — create tags in the settings.</p>
    </div>

    <h3>Description</h3>
    <!-- eslint-disable vue/no-v-html -- renderedHtml is DOMPurify-sanitized in markdown/render.ts -->
    <div
      v-if="!descriptionEditing"
      ref="staticPreviewEl"
      class="preview preview-static markdown-rich"
      title="Click to edit"
      @click="descriptionEditing = true"
      v-html="renderedHtml"
    />
    <!-- eslint-enable vue/no-v-html -->
    <template v-else>
      <div class="desc-editor">
        <textarea
          v-model="descriptionDraft"
          class="desc-input"
          placeholder="Notes, links, code — Markdown supported."
          @blur="saveDescription"
        />
        <!-- eslint-disable-next-line vue/no-v-html -- renderedHtml is DOMPurify-sanitized in markdown/render.ts -->
        <div ref="livePreviewEl" class="preview markdown-rich" v-html="renderedHtml" />
      </div>
      <div class="desc-actions">
        <button class="primary" @click="saveDescription">
          <i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Send
        </button>
      </div>
    </template>
    <p v-if="descError" class="error">{{ descError }}</p>
    <p v-if="descriptionChangedElsewhere" class="changed-elsewhere">
      This description changed on GitHub.
      <button type="button" class="ghost" @click="useStoredDescription">Use theirs</button>
      <button type="button" class="ghost" @click="saveDescription">Keep mine</button>
    </p>

    <h3>Actions</h3>
    <div class="actions">
      <button
        v-if="item.status === 'active'"
        :disabled="item.description === null"
        @click="emit('complete', item.id)"
      >
        <i class="fa-solid fa-check" aria-hidden="true"></i> Complete
      </button>
      <button v-if="item.status === 'complete'" @click="emit('uncomplete', item.id)">
        <i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Reopen
      </button>
      <button v-if="item.status === 'discarded'" @click="emit('restore', item.id)">
        <i class="fa-solid fa-trash-arrow-up" aria-hidden="true"></i> Restore
      </button>
      <button v-if="item.status !== 'discarded'" class="danger" @click="emit('discard', item.id)">
        <i class="fa-solid fa-ban" aria-hidden="true"></i> Discard
      </button>
      <button class="danger" @click="showDeleteConfirm = true">
        <i class="fa-solid fa-trash" aria-hidden="true"></i> Delete
      </button>
    </div>

    <ModalDialog v-if="showDeleteConfirm" labelled-by="delete-item-title" @cancel="showDeleteConfirm = false">
      <h4 id="delete-item-title">Delete "{{ item.headline }}"?</h4>
      <p>This permanently removes the item and its description. This cannot be undone.</p>
      <div class="confirm-actions">
        <button class="ghost" autofocus @click="showDeleteConfirm = false">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i> Cancel
        </button>
        <button v-if="item.status !== 'discarded'" class="ghost" @click="discardInstead">
          <i class="fa-solid fa-ban" aria-hidden="true"></i> Discard instead
        </button>
        <button class="danger" @click="confirmDelete">
          <i class="fa-solid fa-trash" aria-hidden="true"></i> Delete permanently
        </button>
      </div>
    </ModalDialog>
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
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

.tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin: 0.8rem 0;
}

.tags .hint {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin: 0;
}

h3 {
  margin: 1rem 0 0;
  font-size: 0.9rem;
}

/* Row vs. column depends on the drawer's own width, not the viewport: the drawer can be narrow
 * even on a wide screen, and vice versa. */
.drawer {
  container-type: inline-size;
}

.desc-editor {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-top: 0.5rem;
}

/* Enough room for two ~40ch-minimum boxes plus the gap between them. */
@container (min-width: 84ch) {
  .desc-editor {
    flex-direction: row;
    flex-wrap: wrap;
  }
}

.desc-input {
  flex: 1 1 40ch;
  max-width: 80ch;
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
}

.desc-editor .preview {
  flex: 1 1 40ch;
  max-width: 80ch;
  min-width: 0;
}

.preview-static {
  margin-top: 0.5rem;
  cursor: text;
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
.desc-actions button,
.confirm-actions button {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
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

.changed-elsewhere {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.changed-elsewhere button.ghost {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.2em 0.7em;
  color: var(--text);
}

#delete-item-title {
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
