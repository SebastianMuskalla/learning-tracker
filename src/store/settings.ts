import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { decryptToken, encryptToken, type EncryptedToken } from './tokenCrypto';

export type TokenStorageMode = 'local' | 'session' | 'passphrase';

export interface RepoSettings {
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  readonly path: string;
}

const SETTINGS_KEY = 'learning-tracker:settings';
const TOKEN_KEY = 'learning-tracker:token';
const ENCRYPTED_TOKEN_KEY = 'learning-tracker:token-encrypted';

interface PersistedSettings extends RepoSettings {
  readonly tokenStorageMode: TokenStorageMode;
}

export const useSettingsStore = defineStore('settings', () => {
  const owner = ref('');
  const repo = ref('');
  const branch = ref('main');
  const path = ref('learning.md');
  const tokenStorageMode = ref<TokenStorageMode>('local');
  const token = ref<string | null>(null);
  /** True once we know a passphrase-encrypted token exists but hasn't been unlocked this session. */
  const needsPassphrase = ref(false);

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
        tokenStorageMode.value = parsed.tokenStorageMode;
      } catch {
        // Corrupt settings blob: fall back to defaults, force the setup screen.
      }
    }

    if (tokenStorageMode.value === 'local') {
      token.value = localStorage.getItem(TOKEN_KEY);
    } else if (tokenStorageMode.value === 'session') {
      token.value = sessionStorage.getItem(TOKEN_KEY);
    } else {
      needsPassphrase.value = localStorage.getItem(ENCRYPTED_TOKEN_KEY) !== null;
    }
  }

  function persistSettings(): void {
    const persisted: PersistedSettings = {
      owner: owner.value,
      repo: repo.value,
      branch: branch.value,
      path: path.value,
      tokenStorageMode: tokenStorageMode.value,
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(persisted));
  }

  async function setToken(newToken: string, mode: TokenStorageMode, passphrase?: string): Promise<void> {
    tokenStorageMode.value = mode;
    persistSettings();

    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ENCRYPTED_TOKEN_KEY);

    if (mode === 'local') {
      localStorage.setItem(TOKEN_KEY, newToken);
    } else if (mode === 'session') {
      sessionStorage.setItem(TOKEN_KEY, newToken);
    } else {
      if (passphrase === undefined || passphrase === '') {
        throw new Error('A passphrase is required for encrypted token storage');
      }
      const encrypted = await encryptToken(newToken, passphrase);
      localStorage.setItem(ENCRYPTED_TOKEN_KEY, JSON.stringify(encrypted));
    }
    token.value = newToken;
    needsPassphrase.value = false;
  }

  async function unlockWithPassphrase(passphrase: string): Promise<boolean> {
    const raw = localStorage.getItem(ENCRYPTED_TOKEN_KEY);
    if (raw === null) return false;
    try {
      const encrypted = JSON.parse(raw) as EncryptedToken;
      token.value = await decryptToken(encrypted, passphrase);
      needsPassphrase.value = false;
      return true;
    } catch {
      return false;
    }
  }

  function updateRepoSettings(settings: RepoSettings): void {
    owner.value = settings.owner;
    repo.value = settings.repo;
    branch.value = settings.branch;
    path.value = settings.path;
    persistSettings();
  }

  function clearToken(): void {
    token.value = null;
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ENCRYPTED_TOKEN_KEY);
    needsPassphrase.value = false;
  }

  loadPersisted();

  return {
    owner,
    repo,
    branch,
    path,
    tokenStorageMode,
    token,
    needsPassphrase,
    isRepoConfigured,
    isReady,
    updateRepoSettings,
    setToken,
    unlockWithPassphrase,
    clearToken,
  };
});
