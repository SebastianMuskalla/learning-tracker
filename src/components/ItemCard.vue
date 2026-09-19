<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { makeHeadline } from '../domain/factories';
import { renderMarkdown } from '../markdown/render';
import { markHits } from '../search/markDom';
import { normalize, splitIntoSegments } from '../search/match';
import { useSearchStore } from '../store/search';
import type { Item, Section, Tag } from '../domain/types';

const { item, section, tags } = defineProps<{
  readonly item: Item;
  readonly section: Section;
  /** The board's tag definitions, used only to look up each of this item's tag colors. */
  readonly tags: readonly Tag[];
}>();

const emit = defineEmits<{
  select: [];
  complete: [];
  editHeadline: [headline: string];
}>();

const itemTags = computed(() => tags.filter((tag) => item.tags.includes(tag.name)));

const searchStore = useSearchStore();

const editing = ref(false);
const draft = ref(item.headline);
const editError = ref('');
const descPreviewEl = ref<HTMLElement | null>(null);
const showDescHint = ref(false);

const descriptionPreviewHtml = computed(() =>
  item.description !== null ? renderMarkdown(item.description) : null,
);

const headlineSegments = computed(() =>
  searchStore.isActive ? splitIntoSegments(item.headline, searchStore.term) : [{ text: item.headline, hit: false }],
);

watch(
  [descriptionPreviewHtml, () => searchStore.term],
  async () => {
    await nextTick();
    updateDescriptionHighlight();
  },
  { immediate: true },
);

function updateDescriptionHighlight(): void {
  if (descPreviewEl.value === null) {
    showDescHint.value = false;
    return;
  }
  if (!searchStore.isActive) {
    markHits(descPreviewEl.value, '');
    showDescHint.value = false;
    return;
  }

  const { markCount } = markHits(descPreviewEl.value, searchStore.term);
  if (markCount === 0) {
    // The raw Markdown source can match without producing a visible mark, e.g. a hit only in a
    // link's target URL, which is not part of the rendered text.
    showDescHint.value =
      item.description !== null && normalize(item.description).text.includes(searchStore.normalizedTerm);
    return;
  }

  const firstMark = descPreviewEl.value.querySelector('mark.search-hit');
  if (firstMark instanceof HTMLElement) {
    const visible = firstMark.offsetTop + firstMark.offsetHeight <= descPreviewEl.value.clientHeight;
    showDescHint.value = !visible;
  } else {
    showDescHint.value = false;
  }
}

function startEdit(event: MouseEvent): void {
  event.stopPropagation();
  draft.value = item.headline;
  editError.value = '';
  editing.value = true;
}

function commitEdit(): void {
  const result = makeHeadline(draft.value);
  if (!result.ok) {
    editError.value = 'Headline cannot be empty.';
    return;
  }
  editing.value = false;
  if (result.value !== item.headline) {
    emit('editHeadline', result.value);
  }
}

function cancelEdit(): void {
  editing.value = false;
}
</script>

<template>
  <li class="card" :class="section" @click="emit('select')">
    <span class="handle" title="Drag to reorder" @click.stop>⠿</span>

    <div class="body">
      <input
        v-if="editing"
        v-model="draft"
        class="headline-input"
        autofocus
        @click.stop
        @keyup.enter="commitEdit"
        @keyup.esc="cancelEdit"
        @blur="commitEdit"
      />
      <span v-else class="headline" @dblclick="startEdit">
        <template v-for="(segment, index) in headlineSegments" :key="index">
          <mark v-if="segment.hit" class="search-hit">{{ segment.text }}</mark>
          <template v-else>{{ segment.text }}</template>
        </template>
      </span>
      <p v-if="editError" class="edit-error">{{ editError }}</p>

      <!-- eslint-disable-next-line vue/no-v-html -- descriptionPreviewHtml is DOMPurify-sanitized in markdown/render.ts -->
      <div v-if="descriptionPreviewHtml" ref="descPreviewEl" class="desc-preview" v-html="descriptionPreviewHtml" />
      <p v-if="showDescHint" class="desc-hint">Also matches in the description (not visible in this preview)</p>
    </div>

    <div
      v-if="itemTags.length > 0"
      class="tag-dots"
      role="img"
      :aria-label="`Tags: ${itemTags.map((t) => t.name).join(', ')}`"
    >
      <span
        v-for="tag in itemTags"
        :key="tag.name"
        class="tag-dot"
        :style="{ '--tag-color': tag.color }"
        :title="tag.name"
      ></span>
    </div>

    <div class="actions" @click.stop>
      <button v-if="section === 'wip'" title="Complete" @click="emit('complete')">
        <i class="fa-solid fa-check" aria-hidden="true"></i>
      </button>
    </div>
  </li>
</template>

<style scoped>
.card {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.6rem 0.7rem;
  margin-bottom: 0.5rem;
  cursor: pointer;
}

.handle {
  color: var(--text-muted);
  cursor: grab;
  padding-top: 0.1rem;
}

.body {
  flex: 1;
  min-width: 0;
}

.headline {
  display: block;
  word-break: break-word;
}

.headline-input {
  width: 100%;
}

.edit-error {
  color: var(--danger);
  font-size: 0.75rem;
  margin: 0.2rem 0 0;
}

.desc-preview {
  position: relative;
  margin-top: 0.35rem;
  font-size: 0.8rem;
  line-height: 1.4em;
  color: var(--text-muted);
  max-height: calc(1.4em * 4);
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to bottom, black 0%, black 70%, transparent 100%);
  mask-image: linear-gradient(to bottom, black 0%, black 70%, transparent 100%);
}

.desc-preview :deep(p) {
  margin: 0 0 0.3em;
}

.desc-preview :deep(pre) {
  white-space: pre-wrap;
  word-break: break-word;
}

.desc-hint {
  margin: 0.3rem 0 0;
  font-size: 0.75rem;
  font-style: italic;
  color: var(--text-muted);
}

.tag-dots {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-shrink: 0;
  /* .card aligns its children to the top by default; center this one instead, so the dots stay
   * centered even when the card grows taller (e.g. a multi-line description preview). */
  align-self: center;
}

.tag-dot {
  width: 0.55rem;
  height: 0.55rem;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--tag-color);
}

.actions {
  display: flex;
  gap: 0.3rem;
}

.actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 5px;
  width: 1.8em;
  height: 1.8em;
  line-height: 1;
}
</style>
