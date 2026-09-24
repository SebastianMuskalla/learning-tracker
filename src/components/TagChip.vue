<script setup lang="ts">
const { name, color, mode, interactive } = defineProps<{
  readonly name: string;
  readonly color: string;
  readonly mode: 'normal' | 'muted' | 'active';
  readonly interactive?: boolean;
}>();

defineEmits<{ click: [] }>();
</script>

<template>
  <button
    v-if="interactive"
    type="button"
    class="chip"
    :class="mode"
    :style="{ '--tag-color': color }"
    :aria-pressed="mode !== 'muted'"
    @click="$emit('click')"
  >
    <i v-if="mode === 'active'" class="fa-solid fa-check" aria-hidden="true"></i>
    {{ name }}
  </button>
  <span v-else class="chip" :class="mode" :style="{ '--tag-color': color }">{{ name }}</span>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
  background: var(--tag-color);
  color: var(--tag-ink);
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 0.8rem;
  line-height: 1.4;
  padding: 0.15em 0.7em;
}

.chip.muted {
  filter: grayscale(1);
  opacity: 0.55;
}

button.chip.muted {
  cursor: pointer;
}

button.chip.muted:hover {
  filter: grayscale(0.4);
}

.chip.active {
  font-weight: 600;
  box-shadow:
    0 0 0 2px var(--surface),
    0 0 0 4px var(--text);
}
</style>
