<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { Item } from '../domain/types';
import { renderMarkdown } from '../markdown/render';

export interface AnchorRect {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
}

// The preview of a keyword link's target. It has no keyword links, no search marks, and no syntax
// colors, and it ignores the pointer, so its links cannot be clicked.
const { target, anchor } = defineProps<{ readonly target: Item; readonly anchor: AnchorRect }>();

const GAP = 6;
const MARGIN = 8;

const tooltipEl = ref<HTMLElement | null>(null);
const position = ref({ top: anchor.bottom + GAP, left: anchor.left });

const descriptionHtml = computed(() => renderMarkdown(target.description ?? ''));

/** Below the link if there is space, else above it. Always fully inside the viewport. */
async function place(): Promise<void> {
  await nextTick();
  const el = tooltipEl.value;
  if (el === null) return;
  const height = el.offsetHeight;
  const width = el.offsetWidth;
  let top = anchor.bottom + GAP;
  if (top + height > window.innerHeight - MARGIN && anchor.top - GAP - height >= MARGIN) {
    top = anchor.top - GAP - height;
  }
  top = Math.max(MARGIN, Math.min(top, window.innerHeight - MARGIN - height));
  const left = Math.max(MARGIN, Math.min(anchor.left, window.innerWidth - MARGIN - width));
  position.value = { top, left };
}

watch(() => [anchor, target.id, descriptionHtml.value], place, { immediate: true });
</script>

<template>
  <Teleport to="body">
    <div
      ref="tooltipEl"
      class="keyword-tooltip"
      role="tooltip"
      :style="{ top: `${position.top}px`, left: `${position.left}px` }"
    >
      <strong class="title">{{ target.headline }}</strong>
      <!-- eslint-disable-next-line vue/no-v-html -- renderMarkdown output is DOMPurify-sanitized -->
      <div class="body markdown-rich" v-html="descriptionHtml" />
    </div>
  </Teleport>
</template>

<style scoped>
.keyword-tooltip {
  position: fixed;
  z-index: 1000;
  width: max-content;
  max-width: min(28rem, calc(100vw - 16px));
  padding: 0.6rem 0.8rem;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  font-size: 0.85rem;
  pointer-events: none;
  overflow-wrap: anywhere;
}

.title {
  display: block;
  margin-bottom: 0.3rem;
}

/* About 8 lines, with a fade at the bottom, as on the cards. */
.body {
  max-height: 12em;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to bottom, black 0%, black 75%, transparent 100%);
  mask-image: linear-gradient(to bottom, black 0%, black 75%, transparent 100%);
}

.body :deep(p) {
  margin: 0 0 0.4em;
}

.body :deep(:first-child) {
  margin-top: 0;
}
</style>
