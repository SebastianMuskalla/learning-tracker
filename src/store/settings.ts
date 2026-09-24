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

const DEFAULT_BRANCH = 'main';
const DEFAULT_PATH = 'learning.md';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** Reads the stored settings. Returns `null` if nothing usable is stored: the value is missing,
 *  is not JSON, or has a field that is not a non-empty string. */
function readPersistedSettings(): RepoSettings | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(SETTINGS_KEY);
  } catch {
    // Storage is blocked (some privacy modes, or site data disabled).
    return null;
  }
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const owner: unknown = Reflect.get(parsed, 'owner');
  const repo: unknown = Reflect.get(parsed, 'repo');
  const branch: unknown = Reflect.get(parsed, 'branch');
  const path: unknown = Reflect.get(parsed, 'path');
  if (
    !isNonEmptyString(owner) ||
    !isNonEmptyString(repo) ||
    !isNonEmptyString(branch) ||
    !isNonEmptyString(path)
  ) {
    return null;
  }
  return { owner, repo, branch, path };
}

function readToken(): string | null {
  try {
    const stored = localStorage.getItem(TOKEN_KEY);
    return isNonEmptyString(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Returns false if the browser does not let the app store the value. */
function writeStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const owner = ref('');
  const repo = ref('');
  const branch = ref(DEFAULT_BRANCH);
  const path = ref(DEFAULT_PATH);
  const token = ref<string | null>(null);

  const isRepoConfigured = computed(() => owner.value.trim() !== '' && repo.value.trim() !== '');
  const isReady = computed(() => isRepoConfigured.value && token.value !== null);

  function loadPersisted(): void {
    // Unusable settings fall back to the defaults, which shows the setup screen.
    const persisted = readPersistedSettings();
    if (persisted !== null) {
      owner.value = persisted.owner;
      repo.value = persisted.repo;
      branch.value = persisted.branch;
      path.value = persisted.path;
    }
    token.value = readToken();
  }

  /** Stores the token and keeps it in memory. Returns false if the browser did not let the app
   *  store it; then it is kept in memory only and is gone after a reload. */
  function setToken(newToken: string): boolean {
    token.value = newToken;
    return writeStorage(TOKEN_KEY, newToken);
  }

  /** Returns false if the browser did not let the app store the settings. */
  function updateRepoSettings(settings: RepoSettings): boolean {
    owner.value = settings.owner;
    repo.value = settings.repo;
    branch.value = settings.branch;
    path.value = settings.path;
    const persisted: RepoSettings = {
      owner: owner.value,
      repo: repo.value,
      branch: branch.value,
      path: path.value,
    };
    return writeStorage(SETTINGS_KEY, JSON.stringify(persisted));
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
