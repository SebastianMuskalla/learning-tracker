<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { makeHeadline, makeOptionalDescription } from '../domain/factories';
import { allItems, findItemById } from '../domain/types';
import type { Board, ItemId, Section, TagName } from '../domain/types';
import { itemMatches } from '../search/match';
import { searchShortcutAction } from '../search/shortcut';
import { useBoardStore } from '../store/board';
import { useSearchStore } from '../store/search';
import { useSettingsStore } from '../store/settings';
import { useTagFilterStore } from '../store/tagFilter';
import { itemHasAnyTag } from '../tags/filter';
import ConflictBanner from './ConflictBanner.vue';
import ItemDetailDrawer from './ItemDetailDrawer.vue';
import ParseErrorBanner from './ParseErrorBanner.vue';
import SearchBar from './SearchBar.vue';
import SectionColumn from './SectionColumn.vue';
import SyncStatusOverlay from './SyncStatusOverlay.vue';
import TagFilterBar from './TagFilterBar.vue';
import TopBar from './TopBar.vue';

const emit = defineEmits<{ openSettings: [reason?: string] }>();

const settings = useSettingsStore();
const boardStore = useBoardStore();
const searchStore = useSearchStore();
const tagFilterStore = useTagFilterStore();

const topBar = ref<{ focusAddInput: () => void } | null>(null);
const searchBar = ref<{ focus: () => void; hasFocus: () => boolean } | null>(null);
const selectedId = ref<ItemId | null>(null);
const selectedItem = computed(() =>
  selectedId.value === null ? null : (findItemById(boardStore.board, selectedId.value) ?? null),
);

const fileUrl = computed(
  () => `https://github.com/${settings.owner}/${settings.repo}/blob/${settings.branch}/${settings.path}`,
);

// Stale names (a tag deleted or renamed by hand since the filter was set) are ignored here, so a
// stored name that no longer exists on the board never hides items.
const effectiveActiveTags = computed(
  () => new Set([...tagFilterStore.activeNames].filter((name) => boardStore.board.tags.some((t) => t.name === name))),
);
const isTagFilterActive = computed(() => effectiveActiveTags.value.size > 0);

function filterSection<T extends { headline: string; description: string | null; tags: readonly TagName[] }>(
  items: readonly T[],
): T[] {
  return items.filter((item) => {
    if (searchStore.isActive && !itemMatches(item, searchStore.term)) return false;
    if (isTagFilterActive.value && !itemHasAnyTag(item, effectiveActiveTags.value)) return false;
    return true;
  });
}

const visibleBoard = computed<Board>(() => ({
  tags: boardStore.board.tags,
  new: filterSection(boardStore.board.new),
  wip: filterSection(boardStore.board.wip),
  complete: filterSection(boardStore.board.complete),
  discarded: filterSection(boardStore.board.discarded),
}));

const totalCount = computed(() => allItems(boardStore.board).length);
const matchCount = computed(() => allItems(visibleBoard.value).length);
const anyFilterActive = computed(() => searchStore.isActive || isTagFilterActive.value);

onMounted(() => {
  void boardStore.load();
  document.addEventListener('visibilitychange', onVisibilityChange);
  document.addEventListener('keydown', onGlobalKeydown);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('beforeunload', onBeforeUnload);
});

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange);
  document.removeEventListener('keydown', onGlobalKeydown);
  window.removeEventListener('pagehide', onPageHide);
  window.removeEventListener('beforeunload', onBeforeUnload);
});

watch(
  () => boardStore.unauthorized,
  (isUnauthorized) => {
    if (isUnauthorized) {
      boardStore.unauthorized = false;
      emit('openSettings', boardStore.errorMessage ?? undefined);
    }
  },
);

function onVisibilityChange(): void {
  if (document.visibilityState === 'visible') {
    // `refresh`, unlike `load`, skips itself while there is unwritten local work, so switching
    // back to this tab mid-edit can never overwrite it with an older remote version.
    void boardStore.refresh();
  } else {
    // The tab may never become visible again (close, navigate away). Get unsaved work out the
    // door now, best-effort, rather than only on the next successful debounce.
    boardStore.flushBeforeUnload();
  }
}

function onPageHide(): void {
  boardStore.flushBeforeUnload();
}

function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (!boardStore.hasUnsavedWork) return;
  // No browser lets us show custom text any more; this is what triggers its own generic prompt.
  event.preventDefault();
}

function onGlobalKeydown(event: KeyboardEvent): void {
  const shortcutAction = searchShortcutAction(event, searchBar.value?.hasFocus() ?? false);
  if (shortcutAction === 'focus') {
    event.preventDefault();
    searchBar.value?.focus();
    return;
  }
  if (shortcutAction === 'browser') return;

  // eslint-disable-next-line no-restricted-syntax -- DOM event target, not a branded-type cast
  const target = event.target as HTMLElement | null;
  const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
  if (event.key === 'n' && !isTyping) {
    event.preventDefault();
    topBar.value?.focusAddInput();
  } else if (event.key === 'Escape') {
    selectedId.value = null;
  }
}

function onAdd(headline: string): void {
  const result = makeHeadline(headline);
  if (!result.ok) return;
  void boardStore.applyAndSync({ type: 'add', headline: result.value });
}

function onReorder(section: Section, fromIndex: number, toIndex: number): void {
  void boardStore.applyAndSync({ type: 'reorder', section, fromIndex, toIndex });
}

function onSelect(id: ItemId): void {
  selectedId.value = id;
}

function onComplete(id: ItemId): void {
  void boardStore.applyAndSync({ type: 'complete', id });
}

function onUncomplete(id: ItemId): void {
  void boardStore.applyAndSync({ type: 'uncomplete', id });
}

function onDiscard(id: ItemId): void {
  void boardStore.applyAndSync({ type: 'discard', id });
}

function onRestore(id: ItemId): void {
  void boardStore.applyAndSync({ type: 'restore', id });
}

function onDelete(id: ItemId): void {
  selectedId.value = null;
  void boardStore.applyAndSync({ type: 'delete', id });
}

function onEditHeadline(id: ItemId, headline: string): void {
  const result = makeHeadline(headline);
  if (!result.ok) return;
  void boardStore.applyAndSync({ type: 'editHeadline', id, headline: result.value });
}

function onSetDescription(id: ItemId, text: string): void {
  const result = makeOptionalDescription(text);
  if (!result.ok) return;
  void boardStore.applyAndSync({ type: 'setDescription', id, description: result.value });
}

function onToggleTag(id: ItemId, tag: TagName): void {
  const item = findItemById(boardStore.board, id);
  if (!item) return;
  if (item.tags.includes(tag)) {
    void boardStore.applyAndSync({ type: 'untagItem', id, tag });
  } else {
    void boardStore.applyAndSync({ type: 'tagItem', id, tag });
  }
}
</script>

<template>
  <div class="board" :class="{ shifted: selectedItem }">
    <TopBar ref="topBar" @add="onAdd" @open-settings="emit('openSettings')" />

    <ParseErrorBanner
      v-if="boardStore.parseError"
      :line="boardStore.parseError.line"
      :reason="boardStore.parseError.reason"
      :file-url="fileUrl"
    />

    <div v-if="boardStore.fileNotFound" class="notice">
      <p>learning.md was not found in {{ settings.owner }}/{{ settings.repo }}.</p>
      <button :disabled="boardStore.syncStatus === 'saving'" @click="boardStore.initializeEmptyFile()">
        <i class="fa-solid fa-file-circle-plus" aria-hidden="true"></i> Create it
      </button>
    </div>

    <TagFilterBar v-if="!boardStore.fileNotFound && boardStore.board.tags.length > 0" :tags="boardStore.board.tags" />

    <main v-if="!boardStore.fileNotFound" class="columns">
      <SectionColumn
        title="New"
        section="new"
        :items="visibleBoard.new"
        :total-count="boardStore.board.new.length"
        :drag-disabled="anyFilterActive"
        :filter-active="anyFilterActive"
        :tags="boardStore.board.tags"
        @reorder="(f: number, t: number) => onReorder('new', f, t)"
        @select="onSelect"
        @edit-headline="onEditHeadline"
      />
      <SectionColumn
        title="WIP"
        section="wip"
        :items="visibleBoard.wip"
        :total-count="boardStore.board.wip.length"
        :drag-disabled="anyFilterActive"
        :filter-active="anyFilterActive"
        :tags="boardStore.board.tags"
        @reorder="(f: number, t: number) => onReorder('wip', f, t)"
        @select="onSelect"
        @complete="onComplete"
        @edit-headline="onEditHeadline"
      />
      <SectionColumn
        title="Complete"
        section="complete"
        :items="visibleBoard.complete"
        :total-count="boardStore.board.complete.length"
        :drag-disabled="anyFilterActive"
        :filter-active="anyFilterActive"
        :tags="boardStore.board.tags"
        @reorder="(f: number, t: number) => onReorder('complete', f, t)"
        @select="onSelect"
        @edit-headline="onEditHeadline"
      />
      <SectionColumn
        title="Discarded"
        section="discarded"
        :items="visibleBoard.discarded"
        :total-count="boardStore.board.discarded.length"
        :drag-disabled="anyFilterActive"
        :filter-active="anyFilterActive"
        :tags="boardStore.board.tags"
        @reorder="(f: number, t: number) => onReorder('discarded', f, t)"
        @select="onSelect"
        @edit-headline="onEditHeadline"
      />
    </main>

    <ItemDetailDrawer
      v-if="selectedItem"
      :item="selectedItem"
      :tags="boardStore.board.tags"
      @close="selectedId = null"
      @edit-headline="(h: string) => onEditHeadline(selectedItem!.id, h)"
      @set-description="(d: string) => onSetDescription(selectedItem!.id, d)"
      @complete="onComplete(selectedItem!.id)"
      @uncomplete="onUncomplete(selectedItem!.id)"
      @discard="onDiscard(selectedItem!.id)"
      @restore="onRestore(selectedItem!.id)"
      @delete="onDelete(selectedItem!.id)"
      @toggle-tag="(tag: TagName) => onToggleTag(selectedItem!.id, tag)"
    />

    <ConflictBanner
      v-if="boardStore.conflict"
      :local="boardStore.conflict.local"
      :remote="boardStore.conflict.remote"
      @keep-mine="boardStore.resolveConflict('keepMine')"
      @keep-theirs="boardStore.resolveConflict('keepTheirs')"
    />

    <div class="floating-bar">
      <SearchBar
        v-if="!boardStore.fileNotFound"
        ref="searchBar"
        :match-count="matchCount"
        :total-count="totalCount"
      />

      <SyncStatusOverlay :sync-status="boardStore.syncStatus" :error-message="boardStore.errorMessage" />
    </div>
  </div>
</template>

<style scoped>
.board {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  transition: margin-right 0.2s ease;
}

@media (min-width: 1300px) {
  .board.shifted {
    margin-right: var(--drawer-width);
  }
}

.notice {
  padding: 2rem;
  text-align: center;
  color: var(--text-muted);
}

.notice button {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  margin-top: 0.6rem;
  background: var(--accent);
  color: var(--accent-contrast);
  border: none;
  border-radius: 6px;
  padding: 0.5em 1.2em;
}

/* Anchors the search bar and sync status badge to the bottom corners, letting them share a row
 * whenever both fit and only wrapping onto separate rows once the viewport is too narrow for
 * that - instead of stacking based on a fixed breakpoint regardless of actual content width. */
.floating-bar {
  position: fixed;
  left: 1rem;
  right: 1rem;
  bottom: 1rem;
  z-index: 50;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  pointer-events: none;
}

.floating-bar > :deep(*) {
  pointer-events: auto;
}

.columns {
  flex: 1;
  padding: 1rem;
  display: grid;
  grid-template-columns: 1fr;
  /* Without this, Grid's default align-content stretches the row tracks to fill any leftover
   * vertical space in this flex:1 container, inflating short columns (e.g. once a filter leaves
   * one or few items) well past their content height. */
  align-content: start;
  gap: 1rem;
  max-width: 48rem;
  margin: 0 auto;
  width: 100%;
}
</style>
