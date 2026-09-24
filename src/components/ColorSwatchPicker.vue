<script setup lang="ts">
import { TAG_PALETTE } from '../tags/palette';

const modelValue = defineModel<string>({ required: true });
</script>

<template>
  <div class="swatches" role="group" aria-label="Color">
    <button
      v-for="swatch in TAG_PALETTE"
      :key="swatch.name"
      type="button"
      class="swatch"
      :class="{ selected: modelValue === swatch.color }"
      :style="{ '--swatch-color': swatch.color }"
      :aria-label="swatch.name"
      :aria-pressed="modelValue === swatch.color"
      :title="swatch.name"
      @click="modelValue = swatch.color"
    ></button>
  </div>
</template>

<style scoped>
.swatches {
  display: grid;
  grid-template-columns: repeat(8, 1.6rem);
  gap: 0.4rem;
}

.swatch {
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 999px;
  background: var(--swatch-color);
  border: 1px solid transparent;
  padding: 0;
}

.swatch.selected {
  box-shadow:
    0 0 0 2px var(--surface),
    0 0 0 4px var(--text);
}
</style>
