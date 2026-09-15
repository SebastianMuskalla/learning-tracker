<script setup lang="ts">
import type { Board, Section } from '../domain/types';

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
  <div class="overlay">
    <div class="dialog">
      <h2>Someone else saved learning.md first</h2>
      <p class="hint">
        Your change and the version already on GitHub can't both be kept automatically. Compare
        them below and pick one — the other is discarded.
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
        </section>

        <section class="version">
          <h3>GitHub's version</h3>
          <div v-for="s in SECTIONS" :key="`remote-${s.key}`" class="section">
            <h4>{{ s.title }} ({{ remote[s.key].length }})</h4>
            <ul>
              <li v-for="item in remote[s.key]" :key="item.id">{{ item.headline }}</li>
            </ul>
          </div>
        </section>
      </div>

      <div class="actions">
        <button class="ghost" @click="$emit('keepTheirs')">Keep GitHub's version</button>
        <button class="primary" @click="$emit('keepMine')">Keep my version</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 100;
}

.dialog {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1.5rem;
  max-width: 40rem;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
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

.actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  justify-content: flex-end;
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
