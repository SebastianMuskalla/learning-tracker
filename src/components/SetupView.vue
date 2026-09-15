<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { getFile } from '../github/client';
import { useSettingsStore } from '../store/settings';
import type { TokenStorageMode } from '../store/settings';

const { reason = null } = defineProps<{ readonly reason?: string | null }>();
const emit = defineEmits<{ done: [] }>();

const settings = useSettingsStore();

const closable = computed(() => settings.isReady && !settings.needsPassphrase);

const fileUrl = computed(
  () => `https://github.com/${settings.owner}/${settings.repo}/blob/${settings.branch}/${settings.path}`,
);
const historyUrl = computed(
  () => `https://github.com/${settings.owner}/${settings.repo}/commits/${settings.branch}/${settings.path}`,
);

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && closable.value) {
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
const storageMode = ref<TokenStorageMode>(settings.tokenStorageMode);
const debounceReorder = ref(settings.debounceReorder);
const passphrase = ref('');
const unlockPassphrase = ref('');

const testState = ref<'idle' | 'testing' | 'ok' | 'error'>('idle');
const testMessage = ref('');
const saveError = ref('');
const unlockError = ref('');

const showUnlock = computed(() => settings.needsPassphrase);

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

  settings.updateRepoSettings({
    owner: owner.value.trim(),
    repo: repo.value.trim(),
    branch: branch.value.trim() || 'main',
    path: path.value.trim() || 'learning.md',
  });
  settings.setDebounceReorder(debounceReorder.value);

  if (token.value.trim() !== '') {
    try {
      await settings.setToken(token.value.trim(), storageMode.value, passphrase.value);
    } catch (cause) {
      saveError.value = cause instanceof Error ? cause.message : String(cause);
      return;
    }
  }

  emit('done');
}

async function unlock(): Promise<void> {
  unlockError.value = '';
  const success = await settings.unlockWithPassphrase(unlockPassphrase.value);
  if (!success) {
    unlockError.value = 'Wrong passphrase, or no encrypted token is stored.';
    return;
  }
  emit('done');
}

function useDifferentRepo(): void {
  settings.clearToken();
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

      <template v-if="showUnlock">
        <h1>Unlock</h1>
        <p class="hint">Enter the passphrase used to encrypt your token on this device.</p>
        <label>
          Passphrase
          <input v-model="unlockPassphrase" type="password" @keyup.enter="unlock" />
        </label>
        <p v-if="unlockError" class="error">{{ unlockError }}</p>
        <div class="actions">
          <button class="primary" @click="unlock">Unlock</button>
          <button class="ghost" @click="useDifferentRepo">Use a different repository</button>
        </div>
      </template>

      <template v-else>
        <div class="header-row">
          <h1>Learning Tracker setup</h1>
          <button v-if="closable" class="close" title="Close (Esc)" @click="emit('done')">✕</button>
        </div>
        <p class="hint">
          Data lives in a private repository, reached through a fine-grained personal access token
          scoped to that repository's Contents (read/write) only.
        </p>

        <div v-if="closable" class="repo-links">
          <a :href="fileUrl" target="_blank" rel="noopener noreferrer">View learning.md on GitHub</a>
          <a :href="historyUrl" target="_blank" rel="noopener noreferrer">View file history</a>
        </div>

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
        <label>
          Token storage
          <select v-model="storageMode">
            <option value="local">Remember on this device</option>
            <option value="session">This session only</option>
            <option value="passphrase">Encrypted with a passphrase</option>
          </select>
        </label>
        <label v-if="storageMode === 'passphrase'">
          Passphrase
          <input v-model="passphrase" type="password" autocomplete="off" />
        </label>
        <label class="checkbox">
          <input v-model="debounceReorder" type="checkbox" />
          Batch rapid drag-and-drop reorders into one commit (recommended)
        </label>

        <div class="actions">
          <button class="ghost" :disabled="testState === 'testing'" @click="testConnection">Test connection</button>
          <button class="primary" @click="save">Save &amp; continue</button>
        </div>
        <p v-if="testMessage" :class="testState === 'error' ? 'error' : 'ok'">{{ testMessage }}</p>
        <p v-if="saveError" class="error">{{ saveError }}</p>
      </template>
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

label.checkbox {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
}

label.checkbox input {
  width: auto;
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

.error {
  color: var(--danger);
  font-size: 0.9rem;
}

.ok {
  color: var(--accent);
  font-size: 0.9rem;
}
</style>
