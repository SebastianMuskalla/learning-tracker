import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { boardsEqual, emptyBoard, validateBoard } from '../domain/board';
import type { Command, DomainError } from '../domain/commands';
import { applyCommand } from '../domain/commands';
import { merge } from '../domain/merge';
import { findItemById, type Board, type ItemId } from '../domain/types';
import { combineMessages, commitMessage, INITIALIZE_MESSAGE } from '../format/commitMessage';
import { parse, type ParseError, type ParseWarning } from '../format/parse';
import { serialize } from '../format/serialize';
import { getFile, putFile } from '../github/client';
import type { GithubClientError, GithubRepoConfig } from '../github/types';
import { useSettingsStore } from './settings';

export type SyncStatus = 'idle' | 'loading' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';

/** How long to wait after the last command before writing a batch (a "quiet period"). */
const PENDING_QUIET_MS = 800;
/** A batch is force-flushed this long after its first command, even if commands keep arriving. */
const PENDING_HARD_CAP_MS = 5000;
/** A batch is also force-flushed once it holds this many commands. */
const PENDING_MAX_COMMANDS = 10;

/** Total PUT attempts for one write, across stale-sha retries and merge retries, before giving up. */
const MAX_SYNC_ATTEMPTS = 4;
const BACKOFF_BASE_DELAYS_MS = [250, 750, 1500];

function commandItemId(command: Command): ItemId | undefined {
  return 'id' in command ? command.id : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Backoff delay for a retry after `attempt` (0-based) previous attempts, with light jitter. */
function backoffDelayMs(attempt: number): number {
  const base = BACKOFF_BASE_DELAYS_MS[Math.min(attempt, BACKOFF_BASE_DELAYS_MS.length - 1)] ?? 1500;
  return base + base * 0.2 * Math.random();
}

function rateLimitDelayMs(retryAfterSeconds: number | null, attempt: number): number {
  if (retryAfterSeconds !== null && Number.isFinite(retryAfterSeconds)) {
    return Math.max(0, retryAfterSeconds * 1000);
  }
  return backoffDelayMs(attempt);
}

export const useBoardStore = defineStore('board', () => {
  const settings = useSettingsStore();

  const board = ref<Board>(emptyBoard());
  const sha = ref<string | null>(null);
  /** The exact file text `sha` refers to. The base for the round-trip gate and for 3-way merges. */
  const baseText = ref<string | null>(null);
  const syncStatus = ref<SyncStatus>('idle');
  const errorMessage = ref<string | null>(null);
  const parseError = ref<ParseError | null>(null);
  const warnings = ref<readonly ParseWarning[]>([]);
  const fileNotFound = ref(false);
  const unauthorized = ref(false);
  const conflict = ref<{ readonly local: Board; readonly remote: Board; readonly message: string } | null>(
    null,
  );

  const canWrite = computed(() => parseError.value === null);
  /** True while there is local work that has not made it into a GitHub commit yet — closing the
   *  tab now would lose it. Drives the "unsaved changes" warning on unload (see BoardView.vue). */
  const hasUnsavedWork = computed(() => syncStatus.value === 'pending' || syncStatus.value === 'saving');

  let queue: Promise<void> = Promise.resolve();

  // One debounced batch of not-yet-written commands. Every command from `applyAndSync` is
  // applied to `board` immediately (so the UI stays instant) and its message is collected here;
  // the whole batch becomes a single commit once things go quiet. See phase 2 of the plan.
  let pendingMessages: string[] = [];
  let pendingBaseBoard: Board | null = null;
  let pendingQuietTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingCapTimer: ReturnType<typeof setTimeout> | null = null;

  function config(): GithubRepoConfig {
    if (settings.token === null) throw new Error('No token configured');
    return {
      owner: settings.owner,
      repo: settings.repo,
      branch: settings.branch,
      path: settings.path,
      token: settings.token,
    };
  }

  function enqueue(job: () => Promise<void>): Promise<void> {
    queue = queue.then(job).catch((cause: unknown) => {
      errorMessage.value = `Internal error: ${cause instanceof Error ? cause.message : String(cause)}`;
      syncStatus.value = 'error';
    });
    return queue;
  }

  /** Always goes through the queue, so a load can never interleave with a write in flight. */
  function load(): Promise<void> {
    return enqueue(() => performLoad());
  }

  /** Like `load`, but skips itself if there is unwritten local work, so it can never clobber it. */
  function refresh(): Promise<void> {
    return enqueue(() => {
      if (pendingMessages.length > 0) return Promise.resolve();
      return performLoad();
    });
  }

  async function performLoad(): Promise<void> {
    syncStatus.value = 'loading';
    errorMessage.value = null;
    fileNotFound.value = false;

    const result = await getFile(config());
    if (!result.ok) {
      if (result.error.type === 'NotFound') {
        fileNotFound.value = true;
        syncStatus.value = 'idle';
        return;
      }
      applyClientError(result.error);
      return;
    }

    const parsed = parse(result.value.text);
    if (!parsed.ok) {
      parseError.value = parsed.error;
      syncStatus.value = 'error';
      return;
    }

    parseError.value = null;
    warnings.value = parsed.value.warnings;
    board.value = parsed.value.board;
    sha.value = result.value.sha;
    baseText.value = result.value.text;
    syncStatus.value = 'saved';
  }

  function initializeEmptyFile(): Promise<void> {
    return enqueue(() => performInitialize());
  }

  async function performInitialize(): Promise<void> {
    syncStatus.value = 'saving';
    const empty = emptyBoard();
    const text = serialize(empty);
    const result = await putFile(config(), { text, sha: null, message: INITIALIZE_MESSAGE });
    if (!result.ok) {
      applyClientError(result.error);
      return;
    }
    board.value = empty;
    sha.value = result.value.sha;
    baseText.value = text;
    fileNotFound.value = false;
    syncStatus.value = 'saved';
  }

  function applyAndSync(command: Command): Promise<void> {
    if (!canWrite.value) {
      errorMessage.value = 'Cannot write: learning.md failed to parse. Fix it on GitHub first.';
      syncStatus.value = 'error';
      return Promise.resolve();
    }

    const previousBoard = board.value;
    const applied = applyCommand(previousBoard, command);
    if (!applied.ok) {
      errorMessage.value = domainErrorMessage(applied.error);
      syncStatus.value = 'error';
      return Promise.resolve();
    }

    const id = commandItemId(command);
    const previousItem = id === undefined ? undefined : findItemById(previousBoard, id);
    const message = commitMessage(command, previousItem);

    if (pendingMessages.length === 0) {
      pendingBaseBoard = previousBoard;
    }
    pendingMessages.push(message);
    board.value = applied.value;
    syncStatus.value = 'pending';

    schedulePendingFlush();
    return Promise.resolve();
  }

  function schedulePendingFlush(): void {
    if (pendingQuietTimer !== null) clearTimeout(pendingQuietTimer);
    pendingQuietTimer = setTimeout(() => {
      pendingQuietTimer = null;
      void enqueue(() => flushPending());
    }, PENDING_QUIET_MS);

    pendingCapTimer ??= setTimeout(() => {
      pendingCapTimer = null;
      if (pendingQuietTimer !== null) {
        clearTimeout(pendingQuietTimer);
        pendingQuietTimer = null;
      }
      void enqueue(() => flushPending());
    }, PENDING_HARD_CAP_MS);

    if (pendingMessages.length >= PENDING_MAX_COMMANDS) {
      // Both timers were just set above (or already were), so both are live here.
      clearTimeout(pendingQuietTimer);
      pendingQuietTimer = null;
      clearTimeout(pendingCapTimer);
      pendingCapTimer = null;
      void enqueue(() => flushPending());
    }
  }

  async function flushPending(): Promise<void> {
    if (pendingQuietTimer !== null) {
      clearTimeout(pendingQuietTimer);
      pendingQuietTimer = null;
    }
    if (pendingCapTimer !== null) {
      clearTimeout(pendingCapTimer);
      pendingCapTimer = null;
    }
    if (pendingMessages.length === 0) return;

    const messages = pendingMessages;
    pendingMessages = [];
    const basis = pendingBaseBoard ?? board.value;
    pendingBaseBoard = null;

    await writeBoard(board.value, combineMessages(messages), basis);
  }

  /** Best-effort write for when the tab is closing and there is no time left to wait for the
   *  normal queue, retries, or a merge. See phase 4 of the plan. */
  function flushBeforeUnload(): void {
    if (pendingQuietTimer !== null) {
      clearTimeout(pendingQuietTimer);
      pendingQuietTimer = null;
    }
    if (pendingCapTimer !== null) {
      clearTimeout(pendingCapTimer);
      pendingCapTimer = null;
    }
    if (pendingMessages.length === 0) return;

    const messages = pendingMessages;
    pendingMessages = [];
    pendingBaseBoard = null;

    const text = serialize(board.value);
    syncStatus.value = 'saving';
    // Fire-and-forget: `keepalive` lets the request finish after the page unloads, but nothing
    // here can await its result or retry a conflict. beforeunload's warning is the backstop.
    void putFile(config(), { text, sha: sha.value, message: combineMessages(messages), keepalive: true });
  }

  /** Serialises, round-trip-checks, and writes `nextBoard`. `previousBoard` is both the
   *  rollback target on failure and the 3-way-merge base if a write races a remote change. */
  async function writeBoard(nextBoard: Board, message: string, previousBoard: Board): Promise<void> {
    const text = serialize(nextBoard);
    const roundTrip = parse(text);
    if (!roundTrip.ok || !boardsEqual(roundTrip.value.board, nextBoard)) {
      board.value = previousBoard;
      errorMessage.value =
        'Internal error: the change could not be safely written back. Nothing was committed.';
      syncStatus.value = 'error';
      return;
    }

    if (text === baseText.value) {
      // Nothing actually changed on the wire (e.g. a reorder that ended up back where it
      // started). Adopt it as the current state without spending a request or a commit.
      board.value = nextBoard;
      syncStatus.value = 'saved';
      return;
    }

    board.value = nextBoard;
    syncStatus.value = 'saving';

    await syncAttempt({ text, sha: sha.value, message, intendedBoard: nextBoard, previousBoard, attempt: 0 });
  }

  interface SyncAttemptInput {
    readonly text: string;
    readonly sha: string | null;
    readonly message: string;
    readonly intendedBoard: Board;
    readonly previousBoard: Board;
    readonly attempt: number;
  }

  async function syncAttempt(input: SyncAttemptInput): Promise<void> {
    const { text, sha: attemptSha, message, intendedBoard, previousBoard, attempt } = input;
    const result = await putFile(config(), { text, sha: attemptSha, message });

    if (result.ok) {
      board.value = intendedBoard;
      sha.value = result.value.sha;
      baseText.value = text;
      syncStatus.value = 'saved';
      return;
    }

    if (result.error.type === 'RateLimited') {
      if (attempt >= MAX_SYNC_ATTEMPTS - 1) {
        board.value = previousBoard;
        applyClientError(result.error);
        return;
      }
      await sleep(rateLimitDelayMs(result.error.retryAfterSeconds, attempt));
      await syncAttempt({ ...input, attempt: attempt + 1 });
      return;
    }

    if (result.error.type !== 'Conflict') {
      board.value = previousBoard;
      applyClientError(result.error);
      return;
    }

    await reconcileConflict(input);
  }

  /**
   * Called after a 409/422. Reads the file once, then decides:
   *  - the remote text already equals what we tried to write → our write landed (or the sha was
   *    merely stale from an eventually-consistent read) — adopt it, done;
   *  - otherwise, 3-way merge `previousBoard` (base), `intendedBoard` (ours) and the fresh remote
   *    board. A stale-sha-only conflict merges trivially back to `intendedBoard`. A real but
   *    mergeable divergence merges the two changes. Either way, retry the (possibly merged)
   *    write with backoff, up to the attempt cap.
   *  - only an unmergeable, genuinely divergent edit on the same item surfaces the conflict dialog.
   */
  async function reconcileConflict(input: SyncAttemptInput): Promise<void> {
    const { text: attemptedText, message, intendedBoard, previousBoard, attempt } = input;

    const fresh = await getFile(config());
    if (!fresh.ok) {
      board.value = previousBoard;
      applyClientError(fresh.error);
      return;
    }

    if (fresh.value.text === attemptedText) {
      board.value = intendedBoard;
      sha.value = fresh.value.sha;
      baseText.value = fresh.value.text;
      syncStatus.value = 'saved';
      return;
    }

    const freshParsed = parse(fresh.value.text);
    if (!freshParsed.ok) {
      board.value = previousBoard;
      parseError.value = freshParsed.error;
      syncStatus.value = 'error';
      return;
    }

    const merged = merge(previousBoard, intendedBoard, freshParsed.value.board);
    if (!merged.ok) {
      board.value = previousBoard;
      sha.value = fresh.value.sha;
      baseText.value = fresh.value.text;
      syncStatus.value = 'conflict';
      errorMessage.value = 'learning.md changed in two places. Choose which version to keep.';
      conflict.value = { local: intendedBoard, remote: freshParsed.value.board, message };
      return;
    }

    if (attempt >= MAX_SYNC_ATTEMPTS - 1) {
      board.value = previousBoard;
      sha.value = fresh.value.sha;
      baseText.value = fresh.value.text;
      errorMessage.value = 'Could not save after several attempts. Try again.';
      syncStatus.value = 'error';
      return;
    }

    const mergedText = serialize(merged.value);
    const roundTrip = parse(mergedText);
    if (!roundTrip.ok || !boardsEqual(roundTrip.value.board, merged.value)) {
      board.value = previousBoard;
      errorMessage.value =
        'Internal error: the merged change could not be safely written back. Nothing was committed.';
      syncStatus.value = 'error';
      return;
    }

    board.value = merged.value;
    await sleep(backoffDelayMs(attempt));
    await syncAttempt({
      text: mergedText,
      sha: fresh.value.sha,
      message,
      intendedBoard: merged.value,
      previousBoard: freshParsed.value.board,
      attempt: attempt + 1,
    });
  }

  /** Resolves an unmergeable conflict by discarding one side. `sha`/`baseText` already hold the
   *  remote's current values, set when the conflict was raised. */
  function resolveConflict(choice: 'keepMine' | 'keepTheirs'): Promise<void> {
    return enqueue(async () => {
      const current = conflict.value;
      if (!current) return;
      conflict.value = null;

      if (choice === 'keepTheirs') {
        board.value = current.remote;
        syncStatus.value = 'saved';
        return;
      }

      await writeBoard(current.local, current.message, current.remote);
    });
  }

  function applyClientError(error: GithubClientError): void {
    syncStatus.value = 'error';
    switch (error.type) {
      case 'Unauthorized':
        unauthorized.value = true;
        errorMessage.value = 'The token was rejected (401). Check it on the settings screen.';
        return;
      case 'NotFound':
        errorMessage.value = 'learning.md was not found in the repository.';
        return;
      case 'Conflict':
        errorMessage.value = 'A write conflict occurred.';
        return;
      case 'RateLimited':
        errorMessage.value = 'GitHub API rate limit hit. Try again shortly.';
        return;
      case 'Network':
        errorMessage.value = `Network error: ${error.message}`;
        return;
      case 'Unknown':
        errorMessage.value = `GitHub API error (${String(error.status)}): ${error.message}`;
        return;
    }
  }

  function domainErrorMessage(error: DomainError): string {
    switch (error.type) {
      case 'ItemNotFound':
        return 'That item no longer exists.';
      case 'CompleteRequiresDescription':
        return 'A completed item must have a description.';
      case 'WrongStatus':
        return `That action requires the item to be ${error.expected}.`;
      case 'AlreadyDiscarded':
        return 'That item is already discarded.';
      case 'InvalidReorderIndex':
        return 'Reorder failed: index out of range.';
    }
  }

  function validate(): void {
    const result = validateBoard(board.value);
    if (!result.ok) {
      errorMessage.value = `Internal consistency error: ${JSON.stringify(result.error)}`;
      syncStatus.value = 'error';
    }
  }

  return {
    board,
    sha,
    baseText,
    syncStatus,
    errorMessage,
    parseError,
    warnings,
    fileNotFound,
    unauthorized,
    conflict,
    canWrite,
    hasUnsavedWork,
    load,
    refresh,
    initializeEmptyFile,
    applyAndSync,
    flushBeforeUnload,
    resolveConflict,
    validate,
  };
});
