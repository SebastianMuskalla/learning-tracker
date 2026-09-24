<script setup lang="ts">
import { onMounted, ref } from 'vue';

// A modal dialog built on the native <dialog> element. `showModal()` gives it the dialog role,
// moves the focus into it (to the element with `autofocus`, if there is one), keeps the focus
// inside it, and makes the rest of the page inert. Mount it with `v-if`; it opens on mount.
const { labelledBy, width = '34rem' } = defineProps<{
  /** The id of the element that names the dialog, usually its heading. */
  readonly labelledBy: string;
  readonly width?: string;
}>();

const emit = defineEmits<{
  /** The user pressed Escape. The parent decides whether to close the dialog. */
  cancel: [];
}>();

const dialogEl = ref<HTMLDialogElement | null>(null);

onMounted(() => {
  const el = dialogEl.value;
  if (el === null) return;
  // jsdom (used by the tests) does not implement showModal().
  if (typeof el.showModal === 'function') {
    el.showModal();
  } else {
    el.setAttribute('open', '');
  }
});

function onCancel(event: Event): void {
  // Keep the element open; the parent removes it with `v-if`.
  event.preventDefault();
  emit('cancel');
}

function onKeydown(event: KeyboardEvent): void {
  // Escape belongs to this dialog only. Without this, listeners further up (for example the one
  // that closes the item drawer) would also react to it.
  if (event.key === 'Escape') {
    event.stopPropagation();
    event.preventDefault();
    emit('cancel');
  }
}
</script>

<template>
  <dialog
    ref="dialogEl"
    class="modal"
    :style="{ maxWidth: width }"
    :aria-labelledby="labelledBy"
    aria-modal="true"
    @cancel="onCancel"
    @keydown="onKeydown"
  >
    <slot />
  </dialog>
</template>

<style scoped>
.modal {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1.2rem;
  width: calc(100% - 2rem);
  max-height: 90vh;
  overflow-y: auto;
}

.modal::backdrop {
  background: rgba(0, 0, 0, 0.4);
}
</style>
