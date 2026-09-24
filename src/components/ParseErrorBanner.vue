<script setup lang="ts">
defineProps<{
  readonly line: number;
  readonly reason: string;
  readonly fileUrl: string;
}>();
</script>

<template>
  <div class="banner">
    <strong v-if="line > 0">learning.md failed to parse (line {{ line }}).</strong>
    <strong v-else>learning.md cannot be read.</strong>
    <span>{{ reason }}</span>
    <a :href="fileUrl" target="_blank" rel="noopener noreferrer">View the file on GitHub</a>
    <span>All writes are blocked until the file is fixed by hand.</span>
  </div>
</template>

<style scoped>
.banner {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.9rem 1rem;
  background: color-mix(in srgb, var(--danger) 12%, var(--surface));
  border-bottom: 1px solid var(--danger);
  color: var(--text);
  font-size: 0.9rem;
}
</style>
