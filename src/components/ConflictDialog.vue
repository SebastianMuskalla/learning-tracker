<script setup lang="ts">
import { computed } from 'vue';
import type { MergeConflict } from '../domain/merge';
import { findItemById, statusOf, type Board, type Item, type Status, type Tag } from '../domain/types';
import ModalDialog from './ModalDialog.vue';

const { local, remote, conflicts } = defineProps<{
  readonly local: Board;
  readonly remote: Board;
  /** The items and tags that changed differently in `local` and `remote`. */
  readonly conflicts: readonly MergeConflict[];
}>();

defineEmits<{
  keepMine: [];
  keepTheirs: [];
}>();

const STATUS_LABEL: Record<Status, string> = {
  new: 'New',
  wip: 'WIP',
  complete: 'Complete',
  discarded: 'Discarded',
};

/** The version of one conflicting item or tag on one side. */
type Version =
  | { readonly kind: 'item'; readonly title: string; readonly item: Item }
  | { readonly kind: 'tag'; readonly title: string; readonly tag: Tag };

interface ConflictRow {
  readonly key: string;
  /** Your version first, then GitHub's version. */
  readonly versions: readonly [Version, Version];
}

const LOCAL_TITLE = 'Your version';
const REMOTE_TITLE = "GitHub's version";

/** Tag names are unique regardless of case, so a tag conflict can name the tag in either case. */
function findTag(board: Board, name: string): Tag | undefined {
  return board.tags.find((tag) => tag.name.toLowerCase() === name.toLowerCase());
}

// `merge` reports a conflict only for an item or a tag that both sides still have: a delete on one
// side wins without the conflict dialog. A row with a missing side is therefore left out.
const rows = computed<ConflictRow[]>(() =>
  conflicts.flatMap((conflict): ConflictRow[] => {
    switch (conflict.type) {
      case 'DivergentEdit': {
        const mine = findItemById(local, conflict.id);
        const theirs = findItemById(remote, conflict.id);
        if (mine === undefined || theirs === undefined) return [];
        return [
          {
            key: `item-${conflict.id}`,
            versions: [
              { kind: 'item', title: LOCAL_TITLE, item: mine },
              { kind: 'item', title: REMOTE_TITLE, item: theirs },
            ],
          },
        ];
      }
      case 'DivergentTagEdit': {
        const mine = findTag(local, conflict.name);
        const theirs = findTag(remote, conflict.name);
        if (mine === undefined || theirs === undefined) return [];
        return [
          {
            key: `tag-${conflict.name}`,
            versions: [
              { kind: 'tag', title: LOCAL_TITLE, tag: mine },
              { kind: 'tag', title: REMOTE_TITLE, tag: theirs },
            ],
          },
        ];
      }
    }
  }),
);

function tagNames(item: Item): string {
  return item.tags.join(', ') || '—';
}
</script>

<template>
  <!-- Escape does not close it: the user has to choose one of the two versions. -->
  <ModalDialog labelled-by="conflict-title" width="48rem">
    <div class="dialog">
      <h2 id="conflict-title">learning.md changed in two places</h2>
      <p class="hint">
        These items were changed differently here and on GitHub, so the app could not combine them
        automatically. Choose which version of these items to keep. The app keeps each other change from both
        places.
      </p>

      <div v-for="row in rows" :key="row.key" class="conflict">
        <div class="versions">
          <section v-for="version in row.versions" :key="version.title" class="version">
            <h3>{{ version.title }}</h3>
            <template v-if="version.kind === 'item'">
              <p class="headline">{{ version.item.headline }}</p>
              <dl>
                <dt>Status</dt>
                <dd>{{ STATUS_LABEL[statusOf(version.item)] }}</dd>
                <dt>Tags</dt>
                <dd>{{ tagNames(version.item) }}</dd>
              </dl>
              <pre class="description">{{ version.item.description ?? '(no description)' }}</pre>
            </template>
            <template v-else>
              <p class="headline">Tag "{{ version.tag.name }}"</p>
              <p class="tag-color">
                <span class="swatch" :style="{ background: version.tag.color }"></span>
                {{ version.tag.color }}
              </p>
            </template>
          </section>
        </div>
      </div>

      <div class="actions">
        <button class="ghost" @click="$emit('keepTheirs')">
          <i class="fa-solid fa-cloud-arrow-down" aria-hidden="true"></i> Keep GitHub's version
        </button>
        <button class="primary" @click="$emit('keepMine')">
          <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Keep my version
        </button>
      </div>
    </div>
  </ModalDialog>
</template>

<style scoped>
.dialog {
  padding: 0.3rem;
}

h2 {
  margin-top: 0;
  font-size: 1.1rem;
}

.hint {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.conflict + .conflict {
  border-top: 1px solid var(--border);
}

.versions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  margin: 1rem 0;
}

@media (min-width: 640px) {
  .versions {
    grid-template-columns: 1fr 1fr;
  }
}

.version {
  background: var(--surface-alt);
  border-radius: 8px;
  padding: 0.75rem;
  min-width: 0;
}

.version h3 {
  margin: 0 0 0.5rem;
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
}

.headline {
  margin: 0 0 0.4rem;
  font-weight: 600;
  word-break: break-word;
}

dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.1rem 0.6rem;
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
}

dt {
  color: var(--text-muted);
}

dd {
  margin: 0;
}

.description {
  margin: 0;
  max-height: 16rem;
  overflow: auto;
  padding: 0.5rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.8rem;
  white-space: pre-wrap;
  word-break: break-word;
}

.tag-color {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  font-size: 0.85rem;
}

.swatch {
  width: 1rem;
  height: 1rem;
  border-radius: 999px;
}

.actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.actions button {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
}

button.primary {
  background: var(--accent);
  color: var(--accent-contrast);
  border: none;
  border-radius: 6px;
  padding: 0.5em 1em;
}

button.ghost {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.5em 1em;
  color: var(--text);
}
</style>
