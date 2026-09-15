<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { makeHeadline, makeOptionalDescription } from '../domain/factories';
import { findItemById } from '../domain/types';
import type { ItemId, Section } from '../domain/types';
import { useBoardStore } from '../store/board';
import { useSettingsStore } from '../store/settings';
import ItemDetailDrawer from './ItemDetailDrawer.vue';
import ParseErrorBanner from './ParseErrorBanner.vue';
import SectionColumn from './SectionColumn.vue';
import TopBar from './TopBar.vue';

const emit = defineEmits<{ openSettings: [] }>();

const settings = useSettingsStore();
const boardStore = useBoardStore();

const topBar = ref<{ focusAddInput: () => void } | null>(null);
const selectedId = ref<ItemId | null>(null);
const selectedItem = computed(() => (selectedId.value === null ? null : findItemById(boardStore.board, selectedId.value) ?? null));

const fileUrl = computed(
  () => `https://github.com/${settings.owner}/${settings.repo}/blob/${settings.branch}/${settings.path}`,
);

onMounted(() => {
  void boardStore.load();
  document.addEventListener('visibilitychange', onVisibilityChange);
  document.addEventListener('keydown', onGlobalKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange);
  document.removeEventListener('keydown', onGlobalKeydown);
});

watch(
  () => boardStore.unauthorized,
  (isUnauthorized) => {
    if (isUnauthorized) {
      boardStore.unauthorized = false;
      emit('openSettings');
    }
  },
);

function onVisibilityChange(): void {
  if (document.visibilityState === 'visible') {
    void boardStore.load();
  }
}

function onGlobalKeydown(event: KeyboardEvent): void {
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
</script>

<template>
  <div class="board">
    <TopBar
      ref="topBar"
      :owner="settings.owner"
      :repo="settings.repo"
      :sync-status="boardStore.syncStatus"
      :error-message="boardStore.errorMessage"
      @add="onAdd"
      @refresh="boardStore.load()"
      @open-settings="emit('openSettings')"
    />

    <ParseErrorBanner
      v-if="boardStore.parseError"
      :line="boardStore.parseError.line"
      :reason="boardStore.parseError.reason"
      :file-url="fileUrl"
    />

    <div v-if="boardStore.fileNotFound" class="notice">
      <p>learning.md was not found in {{ settings.owner }}/{{ settings.repo }}.</p>
      <button @click="boardStore.initializeEmptyFile()">Create it</button>
    </div>

    <main v-else class="columns">
      <div class="active-group">
        <SectionColumn
          title="New"
          section="new"
          :items="boardStore.board.new"
          @reorder="(f: number, t: number) => onReorder('new', f, t)"
          @select="onSelect"
          @complete="onComplete"
          @discard="onDiscard"
          @edit-headline="onEditHeadline"
        />
        <SectionColumn
          title="WIP"
          section="wip"
          :items="boardStore.board.wip"
          @reorder="(f: number, t: number) => onReorder('wip', f, t)"
          @select="onSelect"
          @complete="onComplete"
          @discard="onDiscard"
          @edit-headline="onEditHeadline"
        />
      </div>
      <SectionColumn
        title="Complete"
        section="complete"
        :items="boardStore.board.complete"
        @reorder="(f: number, t: number) => onReorder('complete', f, t)"
        @select="onSelect"
        @uncomplete="onUncomplete"
        @discard="onDiscard"
        @edit-headline="onEditHeadline"
      />
      <SectionColumn
        title="Discarded"
        section="discarded"
        :items="boardStore.board.discarded"
        @reorder="(f: number, t: number) => onReorder('discarded', f, t)"
        @select="onSelect"
        @restore="onRestore"
        @edit-headline="onEditHeadline"
      />
    </main>

    <ItemDetailDrawer
      v-if="selectedItem"
      :item="selectedItem"
      @close="selectedId = null"
      @edit-headline="(h: string) => onEditHeadline(selectedItem!.id, h)"
      @set-description="(d: string) => onSetDescription(selectedItem!.id, d)"
      @complete="onComplete(selectedItem!.id)"
      @uncomplete="onUncomplete(selectedItem!.id)"
      @discard="onDiscard(selectedItem!.id)"
      @restore="onRestore(selectedItem!.id)"
    />
  </div>
</template>

<style scoped>
.board {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.notice {
  padding: 2rem;
  text-align: center;
  color: var(--text-muted);
}

.notice button {
  margin-top: 0.6rem;
  background: var(--accent);
  color: var(--accent-contrast);
  border: none;
  border-radius: 6px;
  padding: 0.5em 1.2em;
}

.columns {
  flex: 1;
  padding: 1rem;
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  max-width: 80rem;
  margin: 0 auto;
  width: 100%;
}

.active-group {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

@media (min-width: 720px) {
  .active-group {
    grid-template-columns: 1fr 1fr;
  }
}

@media (min-width: 1000px) {
  .columns {
    grid-template-columns: 2fr 1fr;
  }
}
</style>
