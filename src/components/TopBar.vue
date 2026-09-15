<script setup lang="ts">
import { ref } from 'vue';
import { makeHeadline } from '../domain/factories';

const emit = defineEmits<{
  add: [headline: string];
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
</script>

<template>
  <header class="topbar">
    <form class="add" @submit.prevent="submitAdd">
      <input ref="addInput" v-model="draft" type="text" placeholder="Topic" aria-label="Add topic" />
      <button type="submit">Add</button>
    </form>

    <button class="settings" title="Settings" @click="emit('openSettings')">⚙</button>
  </header>
  <p v-if="addError" class="add-error">{{ addError }}</p>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.add {
  display: flex;
  gap: 0.4rem;
  flex: 1;
}

.add input {
  flex: 1;
}

.settings {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.3em 0.6em;
  line-height: 1.2;
}

.add-error {
  margin: 0;
  padding: 0.4rem 1rem;
  font-size: 0.85rem;
  color: var(--danger);
  background: var(--surface);
}
</style>
