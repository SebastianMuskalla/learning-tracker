<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { makeHexColor, makeTagName } from '../domain/factories';
import { allItems, type HexColor, type Tag, type TagName } from '../domain/types';
import { getFile } from '../github/client';
import { useBoardStore } from '../store/board';
import { useSettingsStore } from '../store/settings';
import { THEME_MODES, useThemeStore, type ThemeMode } from '../store/theme';
import { TAG_PALETTE } from '../tags/palette';
import ColorSwatchPicker from './ColorSwatchPicker.vue';
import TagChip from './TagChip.vue';

const { reason = null } = defineProps<{ readonly reason?: string | null }>();
const emit = defineEmits<{ done: [] }>();

const settings = useSettingsStore();
const boardStore = useBoardStore();
const theme = useThemeStore();

const themeLabels: Record<ThemeMode, { readonly label: string; readonly icon: string }> = {
  system: { label: 'Device', icon: 'fa-circle-half-stroke' },
  light: { label: 'Light', icon: 'fa-sun' },
  dark: { label: 'Dark', icon: 'fa-moon' },
};

const closable = computed(() => settings.isReady);

const fileUrl = computed(
  () => `https://github.com/${settings.owner}/${settings.repo}/blob/${settings.branch}/${settings.path}`,
);
const historyUrl = computed(
  () => `https://github.com/${settings.owner}/${settings.repo}/commits/${settings.branch}/${settings.path}`,
);

const tagsBlockVisible = computed(
  () => closable.value && boardStore.sha !== null && boardStore.canWrite && !boardStore.fileNotFound,
);
const tagsParseErrorVisible = computed(
  () => closable.value && boardStore.sha !== null && !boardStore.fileNotFound && !boardStore.canWrite,
);

const colorPickerOpenFor = ref<TagName | null>(null);
const deleteTarget = ref<Tag | null>(null);
const newTagName = ref('');
const newTagError = ref('');

const [firstPaletteColor] = TAG_PALETTE;
if (firstPaletteColor === undefined) throw new Error('TAG_PALETTE must not be empty');

const defaultNewTagColor = computed<HexColor>(() => {
  const usedColors = new Set(boardStore.board.tags.map((t) => t.color));
  return (TAG_PALETTE.find((p) => !usedColors.has(p.color)) ?? firstPaletteColor).color;
});
const newTagColor = ref<HexColor>(defaultNewTagColor.value);
watch(defaultNewTagColor, (next) => {
  newTagColor.value = next;
});

function usageCount(name: TagName): number {
  return allItems(boardStore.board).filter((item) => item.tags.includes(name)).length;
}

function usageLabel(name: TagName): string {
  const count = usageCount(name);
  return count === 1 ? 'used by 1 item' : `used by ${String(count)} items`;
}

const deleteConfirmText = computed(() => {
  if (!deleteTarget.value) return '';
  const count = usageCount(deleteTarget.value.name);
  if (count === 0) return 'No item uses it.';
  if (count === 1) return 'It is used by 1 item. It will lose this tag.';
  return `It is used by ${String(count)} items. They will lose this tag.`;
});

function addTag(): void {
  newTagError.value = '';
  const result = makeTagName(newTagName.value);
  if (!result.ok) {
    newTagError.value = 'Enter a tag name: letters, digits, "_" or "-", up to 32 characters.';
    return;
  }
  const name = result.value;
  if (boardStore.board.tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
    newTagError.value = `A tag named "${name}" already exists.`;
    return;
  }
  void boardStore.applyAndSync({ type: 'createTag', name, color: newTagColor.value });
  newTagName.value = '';
}

function recolorTag(tag: Tag, color: string): void {
  colorPickerOpenFor.value = null;
  if (color === tag.color) return;
  const result = makeHexColor(color);
  if (!result.ok) return;
  void boardStore.applyAndSync({ type: 'setTagColor', name: tag.name, color: result.value });
}

function confirmDeleteTag(): void {
  if (!deleteTarget.value) return;
  void boardStore.applyAndSync({ type: 'deleteTag', name: deleteTarget.value.name });
  deleteTarget.value = null;
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  if (deleteTarget.value !== null) {
    deleteTarget.value = null;
    return;
  }
  if (closable.value) {
    emit('done');
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
});

const owner = ref(settings.owner);
const repo = ref(settings.repo);
const branch = ref(settings.branch || 'main');
const path = ref(settings.path || 'learning.md');
const token = ref('');

const testState = ref<'idle' | 'testing' | 'ok' | 'error'>('idle');
const testMessage = ref('');
const saveError = ref('');

const repoFieldsFilled = computed(
  () =>
    owner.value.trim() !== '' &&
    repo.value.trim() !== '' &&
    branch.value.trim() !== '' &&
    path.value.trim() !== '',
);

async function testConnection(): Promise<void> {
  testState.value = 'testing';
  testMessage.value = '';
  const result = await getFile({
    owner: owner.value.trim(),
    repo: repo.value.trim(),
    branch: branch.value.trim(),
    path: path.value.trim(),
    token: token.value.trim(),
  });
  if (result.ok) {
    testState.value = 'ok';
    testMessage.value = `Connected — read ${String(result.value.text.length)} bytes.`;
  } else if (result.error.type === 'NotFound') {
    testState.value = 'ok';
    testMessage.value = 'Connected — the file does not exist yet; it can be created on first save.';
  } else {
    testState.value = 'error';
    testMessage.value = describeError(result.error.type);
  }
}

async function save(): Promise<void> {
  saveError.value = '';
  if (owner.value.trim() === '' || repo.value.trim() === '') {
    saveError.value = 'Owner and repository are required.';
    return;
  }
  if (token.value.trim() === '' && settings.token === null) {
    saveError.value = 'A token is required on first setup.';
    return;
  }

  // Write any pending batch to the repository it was made for before possibly switching to a
  // different one below (see doc/requirement-3-tagging.md, section 3.7).
  await boardStore.flushNow();

  settings.updateRepoSettings({
    owner: owner.value.trim(),
    repo: repo.value.trim(),
    branch: branch.value.trim() || 'main',
    path: path.value.trim() || 'learning.md',
  });

  if (token.value.trim() !== '') {
    settings.setToken(token.value.trim());
  }

  emit('done');
}

function describeError(type: string): string {
  switch (type) {
    case 'Unauthorized':
      return 'Unauthorized — check the token and its repository scope.';
    case 'RateLimited':
      return 'Rate limited by GitHub — try again shortly.';
    case 'Network':
      return 'Network error — is api.github.com reachable from this device?';
    default:
      return `Request failed (${type}).`;
  }
}
</script>

<template>
  <div class="setup">
    <div class="card">
      <p v-if="reason" class="reason">{{ reason }}</p>

      <div class="header-row">
        <h1>Learning Tracker setup</h1>
        <button v-if="closable" class="close" title="Close (Esc)" @click="emit('done')">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>
      <p class="hint">
        Data lives in a private repository, reached through a fine-grained personal access token scoped to
        that repository's Contents (read/write) only.
      </p>

      <div v-if="closable" class="repo-links">
        <a :href="fileUrl" target="_blank" rel="noopener noreferrer">View learning.md on GitHub</a>
        <a :href="historyUrl" target="_blank" rel="noopener noreferrer">View file history</a>
      </div>

      <fieldset class="theme-block">
        <legend>Theme</legend>
        <div class="theme-options">
          <label v-for="mode in THEME_MODES" :key="mode" class="theme-option">
            <input
              type="radio"
              name="theme"
              :value="mode"
              :checked="theme.mode === mode"
              @change="theme.setMode(mode)"
            />
            <i :class="['fa-solid', themeLabels[mode].icon]" aria-hidden="true"></i>
            {{ themeLabels[mode].label }}
          </label>
        </div>
        <p class="theme-hint">"Device" follows your device's light or dark setting.</p>
      </fieldset>

      <section v-if="tagsBlockVisible" class="tags-block">
        <h2>Tags</h2>

        <ul class="tag-list">
          <li v-for="tag in boardStore.board.tags" :key="tag.name" class="tag-row">
            <TagChip :name="tag.name" :color="tag.color" mode="normal" />
            <span class="tag-usage">{{ usageLabel(tag.name) }}</span>
            <button
              type="button"
              class="icon-button"
              title="Change color"
              :aria-label="`Change color of tag ${tag.name}`"
              @click="colorPickerOpenFor = colorPickerOpenFor === tag.name ? null : tag.name"
            >
              <i class="fa-solid fa-palette" aria-hidden="true"></i>
            </button>
            <button
              type="button"
              class="icon-button danger"
              title="Delete tag"
              :aria-label="`Delete tag ${tag.name}`"
              @click="deleteTarget = tag"
            >
              <i class="fa-solid fa-trash" aria-hidden="true"></i>
            </button>
            <ColorSwatchPicker
              v-if="colorPickerOpenFor === tag.name"
              class="inline-picker"
              :model-value="tag.color"
              @update:model-value="(c) => recolorTag(tag, c)"
            />
          </li>
        </ul>

        <div class="new-tag">
          <input
            v-model="newTagName"
            type="text"
            maxlength="32"
            pattern="[\p{L}\p{N}_-]{1,32}"
            aria-label="New tag name"
            placeholder="New tag name"
            @keyup.enter="addTag"
          />
          <ColorSwatchPicker v-model="newTagColor" />
          <button type="button" class="ghost" @click="addTag">
            <i class="fa-solid fa-plus" aria-hidden="true"></i> Add
          </button>
        </div>
        <p v-if="newTagError" class="error">{{ newTagError }}</p>
      </section>
      <p v-else-if="tagsParseErrorVisible" class="hint">Fix learning.md before editing tags.</p>

      <label>
        Owner
        <input v-model="owner" placeholder="your-github-username" autocomplete="off" />
      </label>
      <label>
        Repository
        <input v-model="repo" placeholder="learning-data" autocomplete="off" />
      </label>
      <label>
        Branch
        <input v-model="branch" placeholder="main" autocomplete="off" />
      </label>
      <label>
        Path
        <input v-model="path" placeholder="learning.md" autocomplete="off" />
      </label>
      <label>
        Personal access token
        <input
          v-model="token"
          type="password"
          :placeholder="settings.token !== null ? 'Leave blank to keep the current token' : 'github_pat_…'"
          autocomplete="off"
        />
      </label>

      <div class="actions">
        <button
          class="ghost"
          :disabled="!repoFieldsFilled || testState === 'testing'"
          @click="testConnection"
        >
          <i class="fa-solid fa-plug" aria-hidden="true"></i> Test connection
        </button>
        <button class="primary" :disabled="!repoFieldsFilled" @click="save">
          <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save &amp; continue
        </button>
      </div>
      <p v-if="testMessage" :class="testState === 'error' ? 'error' : 'ok'">{{ testMessage }}</p>
      <p v-if="saveError" class="error">{{ saveError }}</p>
    </div>

    <div v-if="deleteTarget" class="confirm-overlay">
      <div class="confirm-dialog">
        <h4>Delete tag "{{ deleteTarget.name }}"?</h4>
        <p>{{ deleteConfirmText }}</p>
        <div class="confirm-actions">
          <button class="ghost" @click="deleteTarget = null">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i> Cancel
          </button>
          <button class="danger" @click="confirmDeleteTag">
            <i class="fa-solid fa-trash" aria-hidden="true"></i> Delete tag
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.setup {
  display: flex;
  justify-content: center;
  padding: 3rem 1rem;
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 2rem;
  max-width: 30rem;
  width: 100%;
}

h1 {
  margin-top: 0;
  font-size: 1.3rem;
}

.header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.header-row h1 {
  flex: 1;
}

.close {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  width: 2em;
  height: 2em;
  flex-shrink: 0;
  color: var(--text);
}

.repo-links {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
  margin-bottom: 1rem;
}

.repo-links a {
  color: var(--accent);
}

.hint {
  color: var(--text-muted);
  font-size: 0.9rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-bottom: 0.9rem;
}

label input,
label select {
  color: var(--text);
  font-size: 0.95rem;
}

.reason {
  background: color-mix(in srgb, var(--warning) 15%, var(--surface));
  border: 1px solid var(--warning);
  border-radius: 6px;
  padding: 0.6rem 0.8rem;
  font-size: 0.85rem;
  margin-top: 0;
}

.actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin-top: 1rem;
}

.actions button {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
}

button.primary {
  background: var(--accent);
  color: var(--accent-contrast);
  border: none;
  border-radius: 6px;
  padding: 0.5em 1em;
}

button.ghost {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.5em 1em;
  color: var(--text);
}

.actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error {
  color: var(--danger);
  font-size: 0.9rem;
}

.ok {
  color: var(--accent);
  font-size: 0.9rem;
}

.theme-block {
  border: none;
  border-top: 1px solid var(--border);
  margin: 0;
  padding: 1rem 0 0;
}

.theme-block legend {
  float: left;
  width: 100%;
  padding: 0;
  margin: 0 0 0.6rem;
  font-size: 1rem;
  font-weight: bold;
}

.theme-options {
  clear: both;
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.theme-option {
  flex-direction: row;
  align-items: center;
  gap: 0.4em;
  margin: 0;
  padding: 0.4em 0.9em;
  font-size: 0.9rem;
  color: var(--text);
  cursor: pointer;
}

.theme-option + .theme-option {
  border-left: 1px solid var(--border);
}

.theme-option:has(input:checked) {
  background: var(--accent);
  color: var(--accent-contrast);
}

.theme-option:has(input:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: -4px;
}

.theme-option input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.theme-hint {
  color: var(--text-muted);
  font-size: 0.8rem;
  margin: 0.4rem 0 1rem;
}

.tags-block {
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  padding: 1rem 0;
  margin-bottom: 1rem;
}

.tags-block h2 {
  margin: 0 0 0.6rem;
  font-size: 1rem;
}

.tag-list {
  list-style: none;
  margin: 0 0 0.8rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  position: relative;
}

.tag-usage {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  width: 2em;
  height: 2em;
  color: var(--text);
  margin-left: auto;
}

.icon-button.danger {
  color: var(--danger);
  margin-left: 0;
}

.inline-picker {
  flex-basis: 100%;
  margin-top: 0.4rem;
}

.new-tag {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
}

.new-tag input {
  flex: 1 1 10rem;
}

.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 100;
}

.confirm-dialog {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1.2rem;
  max-width: 34rem;
  width: 100%;
}

.confirm-dialog h4 {
  margin: 0 0 0.5rem;
}

.confirm-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: flex-end;
  margin-top: 1rem;
}

.confirm-actions button {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
}

.confirm-actions button.ghost {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.4em 0.9em;
  color: var(--text);
}

.confirm-actions button.danger {
  background: var(--danger);
  color: var(--accent-contrast);
  border: none;
  border-radius: 6px;
  padding: 0.4em 0.9em;
}
</style>
