<script setup lang="ts">
import type { SyncStatus } from '../store/board';

const {
  syncStatus,
  errorMessage,
  notice = null,
} = defineProps<{
  readonly syncStatus: SyncStatus;
  readonly errorMessage: string | null;
  /** A non-blocking message that is not an error. */
  readonly notice?: string | null;
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
  <div v-if="syncStatus !== 'idle' || notice" class="overlay" :class="syncStatus" role="status">
    <span v-if="syncStatus !== 'idle'" class="label">{{ STATUS_LABEL[syncStatus] }}</span>
    <span v-if="errorMessage" class="message">{{ errorMessage }}</span>
    <span v-if="notice" class="message">{{ notice }}</span>
  </div>
</template>

<style scoped>
.overlay {
  /* Pins to the right edge of the floating-bar flex row in BoardView.vue, whether it shares a
   * row with the search bar or wraps onto its own. */
  margin-left: auto;
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
