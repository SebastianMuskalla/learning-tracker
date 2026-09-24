import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export interface RepoSettings {
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  readonly path: string;
}

const SETTINGS_KEY = 'learning-tracker:settings';
const TOKEN_KEY = 'learning-tracker:token';

type PersistedSettings = RepoSettings;

export const useSettingsStore = defineStore('settings', () => {
  const owner = ref('');
  const repo = ref('');
  const branch = ref('main');
  const path = ref('learning.md');
  const token = ref<string | null>(null);

  const isRepoConfigured = computed(() => owner.value.trim() !== '' && repo.value.trim() !== '');
  const isReady = computed(() => isRepoConfigured.value && token.value !== null);

  function loadPersisted(): void {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw) as PersistedSettings;
        owner.value = parsed.owner;
        repo.value = parsed.repo;
        branch.value = parsed.branch;
        path.value = parsed.path;
      } catch {
        // Corrupt settings blob: fall back to defaults, force the setup screen.
      }
    }

    token.value = localStorage.getItem(TOKEN_KEY);
  }

  function persistSettings(): void {
    const persisted: PersistedSettings = {
      owner: owner.value,
      repo: repo.value,
      branch: branch.value,
      path: path.value,
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(persisted));
  }

  function setToken(newToken: string): void {
    localStorage.setItem(TOKEN_KEY, newToken);
    token.value = newToken;
  }

  function updateRepoSettings(settings: RepoSettings): void {
    owner.value = settings.owner;
    repo.value = settings.repo;
    branch.value = settings.branch;
    path.value = settings.path;
    persistSettings();
  }

  loadPersisted();

  return {
    owner,
    repo,
    branch,
    path,
    token,
    isRepoConfigured,
    isReady,
    updateRepoSettings,
    setToken,
  };
});
