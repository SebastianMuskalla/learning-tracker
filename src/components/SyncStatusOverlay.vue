<script setup lang="ts">
import type { SyncStatus } from '../store/board';

const { syncStatus, errorMessage } = defineProps<{
  readonly syncStatus: SyncStatus;
  readonly errorMessage: string | null;
}>();

const STATUS_LABEL: Record<SyncStatus, string> = {
  idle: 'Idle',
  loading: 'Loading…',
  pending: 'Unsaved changes…',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Error',
  conflict: 'Conflict',
};
</script>

<template>
  <div v-if="syncStatus !== 'idle'" class="overlay" :class="syncStatus">
    <span class="label">{{ STATUS_LABEL[syncStatus] }}</span>
    <span v-if="errorMessage" class="message">{{ errorMessage }}</span>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  max-width: min(20rem, calc(100vw - 2rem));
  padding: 0.5rem 0.8rem;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  font-size: 0.8rem;
}

.label {
  font-weight: 600;
  color: var(--text-muted);
}

.overlay.saved .label {
  color: var(--accent);
}

.overlay.error .label,
.overlay.conflict .label {
  color: var(--danger);
}

.overlay.saving .label,
.overlay.loading .label,
.overlay.pending .label {
  color: var(--warning);
}

.message {
  color: var(--text-muted);
}
</style>
