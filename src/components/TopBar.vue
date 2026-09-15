<script setup lang="ts">
import { ref } from 'vue';
import { makeHeadline } from '../domain/factories';
import type { SyncStatus } from '../store/board';

const { owner, repo, syncStatus, errorMessage, fileUrl, historyUrl } = defineProps<{
  readonly owner: string;
  readonly repo: string;
  readonly syncStatus: SyncStatus;
  readonly errorMessage: string | null;
  readonly fileUrl: string;
  readonly historyUrl: string;
}>();

const emit = defineEmits<{
  add: [headline: string];
  refresh: [];
  openSettings: [];
}>();

const draft = ref('');
const addInput = ref<HTMLInputElement | null>(null);
const addError = ref('');

function submitAdd(): void {
  const result = makeHeadline(draft.value);
  if (!result.ok) {
    addError.value = 'Enter a short, single-line headline.';
    return;
  }
  addError.value = '';
  emit('add', result.value);
  draft.value = '';
}

function focusAddInput(): void {
  addInput.value?.focus();
}

defineExpose({ focusAddInput });

const STATUS_LABEL: Record<SyncStatus, string> = {
  idle: 'Idle',
  loading: 'Loading…',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Error',
  conflict: 'Conflict',
};
</script>

<template>
  <header class="topbar">
    <div class="repo">
      <strong>{{ owner }}/{{ repo }}</strong>
      <span class="status" :class="syncStatus">{{ STATUS_LABEL[syncStatus] }}</span>
    </div>

    <form class="add" @submit.prevent="submitAdd">
      <input
        ref="addInput"
        v-model="draft"
        type="text"
        placeholder="Add a topic… (n)"
        aria-label="Add topic"
      />
      <button type="submit">Add</button>
    </form>

    <div class="actions">
      <a :href="fileUrl" target="_blank" rel="noopener noreferrer" title="Open learning.md on GitHub">📄</a>
      <a :href="historyUrl" target="_blank" rel="noopener noreferrer" title="View file history on GitHub">🕐</a>
      <button title="Refresh" @click="emit('refresh')">⟳</button>
      <button title="Settings" @click="emit('openSettings')">⚙</button>
    </div>
  </header>
  <p v-if="addError" class="add-error">{{ addError }}</p>
  <p v-if="errorMessage" class="topbar-error">{{ errorMessage }}</p>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.75rem 1rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.repo {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  white-space: nowrap;
}

.status {
  font-size: 0.75rem;
  padding: 0.15em 0.6em;
  border-radius: 999px;
  background: var(--surface-alt);
  color: var(--text-muted);
}

.status.saved {
  color: var(--accent);
}

.status.error,
.status.conflict {
  color: var(--danger);
}

.status.saving,
.status.loading {
  color: var(--warning);
}

.add {
  display: flex;
  gap: 0.4rem;
  flex: 1;
  min-width: 12rem;
}

.add input {
  flex: 1;
}

.actions {
  display: flex;
  gap: 0.4rem;
}

.actions button,
.actions a {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.3em 0.6em;
  line-height: 1.2;
  text-decoration: none;
}

.add-error,
.topbar-error {
  margin: 0;
  padding: 0.4rem 1rem;
  font-size: 0.85rem;
  color: var(--danger);
  background: var(--surface);
}
</style>
