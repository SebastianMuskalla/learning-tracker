<script setup lang="ts">
import type { Board, Section } from '../domain/types';
import ModalDialog from './ModalDialog.vue';

const { local, remote } = defineProps<{
  readonly local: Board;
  readonly remote: Board;
}>();

defineEmits<{
  keepMine: [];
  keepTheirs: [];
}>();

const SECTIONS: readonly { readonly key: Section; readonly title: string }[] = [
  { key: 'new', title: 'New' },
  { key: 'wip', title: 'WIP' },
  { key: 'complete', title: 'Complete' },
  { key: 'discarded', title: 'Discarded' },
];
</script>

<template>
  <!-- Escape does not close it: the user has to choose one of the two versions. -->
  <ModalDialog labelled-by="conflict-title" width="40rem">
    <div class="dialog">
      <h2 id="conflict-title">learning.md changed in two places</h2>
      <p class="hint">
        The same item was changed differently here and on GitHub, so the app could not combine them
        automatically. Compare the two versions below and pick one — the other is discarded.
      </p>

      <div class="versions">
        <section class="version">
          <h3>Your version</h3>
          <div v-for="s in SECTIONS" :key="`local-${s.key}`" class="section">
            <h4>{{ s.title }} ({{ local[s.key].length }})</h4>
            <ul>
              <li v-for="item in local[s.key]" :key="item.id">{{ item.headline }}</li>
            </ul>
          </div>
          <p class="tags-line">Tags: {{ local.tags.map((t) => t.name).join(', ') || '—' }}</p>
        </section>

        <section class="version">
          <h3>GitHub's version</h3>
          <div v-for="s in SECTIONS" :key="`remote-${s.key}`" class="section">
            <h4>{{ s.title }} ({{ remote[s.key].length }})</h4>
            <ul>
              <li v-for="item in remote[s.key]" :key="item.id">{{ item.headline }}</li>
            </ul>
          </div>
          <p class="tags-line">Tags: {{ remote.tags.map((t) => t.name).join(', ') || '—' }}</p>
        </section>
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
  font-size: 0.9rem;
}

.section h4 {
  margin: 0.5rem 0 0.2rem;
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
}

.section ul {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.85rem;
}

.tags-line {
  margin: 0.6rem 0 0;
  font-size: 0.8rem;
  color: var(--text-muted);
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
