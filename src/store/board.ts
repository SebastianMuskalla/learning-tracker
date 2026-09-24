import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { boardsEqual, emptyBoard } from '../domain/board';
import type { Command, DomainError } from '../domain/commands';
import { applyCommand } from '../domain/commands';
import { generateItemId, nowTimestamp } from '../domain/factories';
import { merge } from '../domain/merge';
import { findItemById, type Board, type IsoTimestamp, type ItemId } from '../domain/types';
import { combineMessages, commitMessage, INITIALIZE_MESSAGE } from '../format/commitMessage';
import { parse, type ParseError, type ParseWarning } from '../format/parse';
import { serialize } from '../format/serialize';
import { getFile, putFile } from '../github/client';
import { describeClientError } from '../github/describeError';
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
/** The longest rate-limit wait that is done inside the queue. A longer wait ends the write and
 *  retries it later on a timer, so loads and conflict choices are not blocked for minutes. */
const MAX_RATE_LIMIT_WAIT_MS = 30_000;
/** Delays for the automatic retries after a temporary error. The last value repeats. */
const RETRY_DELAYS_MS = [2000, 5000, 15_000, 60_000];

/** One local command that is not in a GitHub commit yet. */
interface PendingCommand {
  readonly command: Command;
  /** When the user made the change. Replaying the command uses this time, so timestamps like
   *  `completedAt` do not change when the command is applied again. */
  readonly at: IsoTimestamp;
  /** This command's line in the commit message, built when it was first applied. */
  readonly message: string;
}

export interface ConflictState {
  readonly local: Board;
  readonly remote: Board;
  /** The sha and text of `remote`. `resolveConflict` uses these, not the store's `sha`. */
  readonly sha: string;
  readonly baseText: string;
  readonly message: string;
  /** The commands that make up `local`. */
  readonly commands: readonly PendingCommand[];
}

function commandItemId(command: Command): ItemId | undefined {
  return command.type !== 'add' && 'id' in command ? command.id : undefined;
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

/** True if the text parses back to exactly `board`. Guards every write against serializer bugs. */
function roundTrips(text: string, board: Board): boolean {
  const parsed = parse(text);
  return parsed.ok && boardsEqual(parsed.value.board, board);
}

/** Errors where the same request can succeed later without any change by the user. */
function isTemporary(error: GithubClientError): boolean {
  switch (error.type) {
    case 'Network':
    case 'RateLimited':
      return true;
    case 'Unknown':
      return error.status >= 500;
    case 'Unauthorized':
    case 'Forbidden':
    case 'NotFound':
    case 'Conflict':
    case 'InvalidUtf8':
      return false;
  }
}

function formatClockTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * The state that is shown (`board`) is always `confirmedBoard` (what GitHub has at `sha`) plus the
 * in-flight commands plus the pending commands. Whenever `confirmedBoard` changes, the local
 * commands are applied again on top of it (`rebaseLocal`), so a change made while a request is
 * in flight is never overwritten by the request's result.
 * See doc/requirement-1-concurrency.md for the write path.
 */
export const useBoardStore = defineStore('board', () => {
  const settings = useSettingsStore();

  // `shallowRef`: boards are immutable values, so deep reactivity would only add overhead.
  const board = shallowRef<Board>(emptyBoard());
  const sha = ref<string | null>(null);
  /** The exact file text `sha` refers to. The base for the round-trip gate and for 3-way merges. */
  const baseText = ref<string | null>(null);
  const syncStatus = ref<SyncStatus>('idle');
  const errorMessage = ref<string | null>(null);
  /** A short, non-blocking message that is not an error (for example, a dropped change). */
  const notice = ref<string | null>(null);
  const parseError = ref<ParseError | null>(null);
  const warnings = ref<readonly ParseWarning[]>([]);
  const fileNotFound = ref(false);
  /** Set when GitHub rejects the token (401) or its permissions (403). The UI then opens the
   *  settings screen and resets this flag. */
  const unauthorized = ref(false);
  const conflict = shallowRef<ConflictState | null>(null);
  /** Commands the user made that are not part of a write yet. */
  const pendingCommands = shallowRef<readonly PendingCommand[]>([]);
  /** Commands that are part of the write that is running now. */
  const inFlightCommands = shallowRef<readonly PendingCommand[]>([]);
  /** Editors with a draft that is not applied as a command yet (see `setDraftDirty`). */
  const dirtyDrafts = shallowRef<ReadonlySet<string>>(new Set());

  /** The board as GitHub has it at `sha`. */
  let confirmedBoard: Board = emptyBoard();

  const canWrite = computed(() => parseError.value === null);
  /** False until the file was read once (or is known not to exist). A write before that would
   *  have no sha to build on. */
  const loaded = computed(() => sha.value !== null || fileNotFound.value);
  /** True while there is local work that is not in a GitHub commit yet. Closing the tab now would
   *  lose it. Drives the "unsaved changes" prompt on unload (see composables/useSyncLifecycle.ts). */
  const hasUnsavedWork = computed(
    () =>
      pendingCommands.value.length > 0 ||
      inFlightCommands.value.length > 0 ||
      conflict.value !== null ||
      dirtyDrafts.value.size > 0,
  );

  let queue: Promise<void> = Promise.resolve();

  // The pending commands are written as one batch (one commit) once things go quiet.
  // See doc/requirement-1-concurrency.md, phase 2.
  let pendingQuietTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingCapTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryCount = 0;

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

  /** Sets the status and the error message together, so an old message never stays visible
   *  next to a newer status. */
  function setStatus(status: SyncStatus, message: string | null = null): void {
    syncStatus.value = status;
    errorMessage.value = message;
  }

  function enqueue(job: () => Promise<void>): Promise<void> {
    queue = queue.then(job).catch((cause: unknown) => {
      if (inFlightCommands.value.length > 0) keepUnsent();
      setStatus('error', `Internal error: ${cause instanceof Error ? cause.message : String(cause)}`);
    });
    return queue;
  }

  /** Makes `newConfirmed` the state GitHub has at `newSha`. */
  function confirm(newConfirmed: Board, newSha: string, text: string): void {
    confirmedBoard = newConfirmed;
    sha.value = newSha;
    baseText.value = text;
  }

  /** Shows `onto` plus the pending commands. A command that no longer applies (for example, its
   *  item was deleted on GitHub) is dropped, and the user gets a notice. */
  function rebaseLocal(onto: Board): void {
    let next = onto;
    const kept: PendingCommand[] = [];
    for (const pending of pendingCommands.value) {
      const applied = applyCommand(next, pending.command, pending.at);
      if (applied.ok) {
        next = applied.value;
        kept.push(pending);
      }
    }
    const dropped = pendingCommands.value.length - kept.length;
    if (dropped > 0) {
      pendingCommands.value = kept;
      notice.value =
        dropped === 1
          ? 'One change no longer fit the newest version of learning.md and was dropped.'
          : `${String(dropped)} changes no longer fit the newest version of learning.md and were dropped.`;
    }
    board.value = next;
  }

  /** After a write that did not go through: the in-flight commands become pending again. */
  function keepUnsent(): void {
    pendingCommands.value = [...inFlightCommands.value, ...pendingCommands.value];
    inFlightCommands.value = [];
    rebaseLocal(confirmedBoard);
  }

  /** After a permanent failure: the in-flight commands are rolled back. */
  function dropInFlight(): void {
    inFlightCommands.value = [];
    rebaseLocal(confirmedBoard);
  }

  /** Sets the status once no request runs any more. Schedules a flush for pending commands that
   *  have no timer yet (for example, commands that were held back while a conflict was open). */
  function settle(): void {
    if (pendingCommands.value.length === 0) {
      setStatus('saved');
      return;
    }
    setStatus('pending');
    if (pendingQuietTimer === null) schedulePendingFlush();
  }

  /** Always goes through the queue, so a load can never interleave with a write in flight.
   *  Flushes any pending local work first, so a reload can never throw it away. */
  function load(): Promise<void> {
    return enqueue(async () => {
      await flushPending();
      if (conflict.value !== null) return;
      await performLoad();
    });
  }

  /** Writes any pending local batch immediately, without waiting for the debounce to settle. */
  function flushNow(): Promise<void> {
    return enqueue(() => flushPending());
  }

  /** Like `load`, but skips itself if there is unwritten local work or an open conflict, so it
   *  can never replace them with an older or newer remote version. (Before the first successful
   *  load, it loads anyway: the pending commands are then applied on top of the loaded file.) */
  function refresh(): Promise<void> {
    return enqueue(() => {
      if (conflict.value !== null) return Promise.resolve();
      if (pendingCommands.value.length > 0 && loaded.value) return Promise.resolve();
      return performLoad();
    });
  }

  /** Writes pending work again after an error, for example when the browser is back online. */
  function retryNow(): Promise<void> {
    if (syncStatus.value !== 'error' || pendingCommands.value.length === 0) return Promise.resolve();
    return flushNow();
  }

  async function performLoad(): Promise<void> {
    setStatus('loading');
    fileNotFound.value = false;

    const result = await getFile(config());
    if (!result.ok) {
      if (result.error.type === 'NotFound') {
        fileNotFound.value = true;
        setStatus('idle');
        return;
      }
      applyClientError(result.error);
      return;
    }

    const parsed = parse(result.value.text);
    if (!parsed.ok) {
      parseError.value = parsed.error;
      setStatus('error');
      return;
    }

    parseError.value = null;
    warnings.value = parsed.value.warnings;
    confirm(parsed.value.board, result.value.sha, result.value.text);
    rebaseLocal(parsed.value.board);
    settle();
  }

  function initializeEmptyFile(): Promise<void> {
    return enqueue(() => performInitialize());
  }

  async function performInitialize(): Promise<void> {
    setStatus('saving');
    const empty = emptyBoard();
    const text = serialize(empty);
    const result = await putFile(config(), { text, sha: null, message: INITIALIZE_MESSAGE });
    if (!result.ok) {
      applyClientError(result.error);
      return;
    }
    confirm(empty, result.value.sha, text);
    fileNotFound.value = false;
    rebaseLocal(empty);
    settle();
  }

  /**
   * Applies `command` to the board at once and adds it to the pending batch. The write happens
   * later, after the debounce. This function does not wait for it.
   */
  function applyAndSync(command: Command): void {
    if (!canWrite.value) {
      setStatus('error', 'Cannot write: learning.md failed to parse. Fix it on GitHub first.');
      return;
    }

    const at = nowTimestamp();
    // Fix the new item's id now, so that replaying the command creates the same item again.
    const stable: Command =
      command.type === 'add' && command.id === undefined ? { ...command, id: generateItemId() } : command;
    const previousBoard = board.value;
    const applied = applyCommand(previousBoard, stable, at);
    if (!applied.ok) {
      setStatus('error', domainErrorMessage(applied.error));
      return;
    }

    const id = commandItemId(stable);
    const previousItem = id === undefined ? undefined : findItemById(previousBoard, id);
    const message = commitMessage(stable, previousItem);

    pendingCommands.value = [...pendingCommands.value, { command: stable, at, message }];
    board.value = applied.value;
    notice.value = null;
    // While the conflict dialog is open, the new command waits; the status stays "conflict".
    if (conflict.value === null) setStatus('pending');

    schedulePendingFlush();
  }

  function clearPendingTimers(): void {
    if (pendingQuietTimer !== null) {
      clearTimeout(pendingQuietTimer);
      pendingQuietTimer = null;
    }
    if (pendingCapTimer !== null) {
      clearTimeout(pendingCapTimer);
      pendingCapTimer = null;
    }
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

    if (pendingCommands.value.length >= PENDING_MAX_COMMANDS) {
      clearPendingTimers();
      void enqueue(() => flushPending());
    }
  }

  function cancelRetry(): void {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  /** Retries the pending work later, outside the queue. Uses `delayMs` if given, otherwise the
   *  next step of `RETRY_DELAYS_MS`. */
  function scheduleRetry(delayMs?: number): void {
    cancelRetry();
    const delay = delayMs ?? RETRY_DELAYS_MS[Math.min(retryCount, RETRY_DELAYS_MS.length - 1)] ?? 60_000;
    retryCount += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void enqueue(() => flushPending());
    }, delay);
  }

  async function flushPending(): Promise<void> {
    clearPendingTimers();
    if (pendingCommands.value.length === 0) return;
    // Held back until the file is loaded, the user resolves the conflict, or the file is fixed.
    // `settle` (after the next load or the conflict choice) schedules the flush again.
    if (!loaded.value || conflict.value !== null || !canWrite.value) return;
    cancelRetry();

    const commands = pendingCommands.value;
    pendingCommands.value = [];
    inFlightCommands.value = commands;
    // No write is in flight here (the queue runs one job at a time), so `board` is exactly
    // `confirmedBoard` plus `commands`.
    await writeBoard(board.value, combineMessages(commands.map((c) => c.message)));
  }

  /**
   * Best-effort write for when the page is going away (`pagehide`) and there is no time left for
   * the queue, retries, or a merge. It does not change any state: if the page comes back from the
   * back/forward cache, the normal flush runs as if nothing happened (and detects a write that
   * landed through the 409 path). See doc/requirement-1-concurrency.md, phase 4.
   */
  function flushBeforeUnload(): void {
    const unsent = [...inFlightCommands.value, ...pendingCommands.value];
    if (unsent.length === 0) return;
    if (!loaded.value || conflict.value !== null || !canWrite.value || settings.token === null) return;

    const text = serialize(board.value);
    if (!roundTrips(text, board.value)) return;
    // Fire-and-forget: `keepalive` lets the request finish after the page unloads, but nothing
    // here can await its result or retry a conflict. The beforeunload prompt is the backstop.
    // The client skips the request if the body is too large for `keepalive`.
    void putFile(config(), {
      text,
      sha: sha.value,
      message: combineMessages(unsent.map((c) => c.message)),
      keepalive: true,
    });
  }

  /** Serializes, round-trip-checks, and writes `target`, which is `confirmedBoard` plus the
   *  in-flight commands. `confirmedBoard` is the 3-way-merge base if the write races a remote change. */
  async function writeBoard(target: Board, message: string): Promise<void> {
    const text = serialize(target);
    if (!roundTrips(text, target)) {
      dropInFlight();
      setStatus(
        'error',
        'Internal error: the change could not be safely written back. Nothing was committed.',
      );
      return;
    }

    if (text === baseText.value && sha.value !== null) {
      // Nothing actually changed on the wire (e.g. a reorder that ended up back where it
      // started). Adopt it as the current state without spending a request or a commit.
      finishWrite(target, sha.value, text);
      return;
    }

    setStatus('saving');
    await syncAttempt({
      text,
      sha: sha.value,
      message,
      intendedBoard: target,
      baseBoard: confirmedBoard,
      attempt: 0,
    });
  }

  /** The write of `written` landed at `newSha`. */
  function finishWrite(written: Board, newSha: string, text: string): void {
    confirm(written, newSha, text);
    inFlightCommands.value = [];
    retryCount = 0;
    rebaseLocal(written);
    settle();
  }

  /**
   * Handles a failed request of a write:
   *  - temporary errors (network, 5xx, rate limit): keep the work and retry on a timer;
   *  - 401/403: keep the work; the user fixes the token on the settings screen, and the next load
   *    writes it;
   *  - invalid UTF-8: keep the work; writes are blocked until the file is fixed;
   *  - every other error: roll back the in-flight commands.
   */
  function writeFailed(error: GithubClientError, retryDelayMs?: number): void {
    if (error.type === 'Unauthorized' || error.type === 'Forbidden' || error.type === 'InvalidUtf8') {
      keepUnsent();
      applyClientError(error);
      return;
    }
    if (isTemporary(error)) {
      keepUnsent();
      const retryAt =
        retryDelayMs === undefined ? '' : ` at ${formatClockTime(new Date(Date.now() + retryDelayMs))}`;
      setStatus('error', `${describeClientError(error)} Not saved — will retry${retryAt}.`);
      scheduleRetry(retryDelayMs);
      return;
    }
    dropInFlight();
    applyClientError(error);
  }

  interface SyncAttemptInput {
    readonly text: string;
    readonly sha: string | null;
    readonly message: string;
    readonly intendedBoard: Board;
    /** The board `sha` refers to. The base of a 3-way merge. */
    readonly baseBoard: Board;
    readonly attempt: number;
  }

  async function syncAttempt(input: SyncAttemptInput): Promise<void> {
    const { text, sha: attemptSha, message, intendedBoard, attempt } = input;
    const result = await putFile(config(), { text, sha: attemptSha, message });

    if (result.ok) {
      finishWrite(intendedBoard, result.value.sha, text);
      return;
    }

    if (result.error.type === 'RateLimited') {
      const waitMs = rateLimitDelayMs(result.error.retryAfterSeconds, attempt);
      if (waitMs > MAX_RATE_LIMIT_WAIT_MS || attempt >= MAX_SYNC_ATTEMPTS - 1) {
        writeFailed(result.error, Math.max(waitMs, RETRY_DELAYS_MS[0] ?? 2000));
        return;
      }
      await sleep(waitMs);
      await syncAttempt({ ...input, attempt: attempt + 1 });
      return;
    }

    if (result.error.type !== 'Conflict') {
      writeFailed(result.error);
      return;
    }

    await reconcileConflict(input);
  }

  /**
   * Called after a 409/422. Reads the file once, then decides:
   *  - the remote text already equals what we tried to write → our write landed (or the sha was
   *    merely stale from an eventually-consistent read) — adopt it, done;
   *  - otherwise, 3-way merge `baseBoard` (base), `intendedBoard` (ours) and the fresh remote
   *    board. A stale-sha-only conflict merges trivially back to `intendedBoard`. A real but
   *    mergeable divergence merges the two changes. Either way, retry the (possibly merged)
   *    write with backoff, up to the attempt cap.
   *  - only an unmergeable, genuinely divergent edit on the same item surfaces the conflict dialog.
   */
  async function reconcileConflict(input: SyncAttemptInput): Promise<void> {
    const { text: attemptedText, message, intendedBoard, baseBoard, attempt } = input;

    const fresh = await getFile(config());
    if (!fresh.ok) {
      writeFailed(fresh.error);
      return;
    }

    if (fresh.value.text === attemptedText) {
      finishWrite(intendedBoard, fresh.value.sha, fresh.value.text);
      return;
    }

    const freshParsed = parse(fresh.value.text);
    if (!freshParsed.ok) {
      // Writes stay blocked until the file is fixed. The work is kept for the next load.
      keepUnsent();
      parseError.value = freshParsed.error;
      setStatus('error');
      return;
    }
    const freshBoard = freshParsed.value.board;

    const merged = merge(baseBoard, intendedBoard, freshBoard);
    if (!merged.ok) {
      conflict.value = {
        local: intendedBoard,
        remote: freshBoard,
        sha: fresh.value.sha,
        baseText: fresh.value.text,
        message,
        commands: inFlightCommands.value,
      };
      inFlightCommands.value = [];
      // Show the last confirmed state (plus newer local commands) while the dialog is open.
      rebaseLocal(confirmedBoard);
      setStatus('conflict', 'learning.md changed in two places. Choose which version to keep.');
      return;
    }

    confirm(freshBoard, fresh.value.sha, fresh.value.text);

    if (attempt >= MAX_SYNC_ATTEMPTS - 1) {
      keepUnsent();
      setStatus('error', 'Could not save after several attempts. Not saved — will retry.');
      scheduleRetry();
      return;
    }

    const mergedText = serialize(merged.value);
    if (!roundTrips(mergedText, merged.value)) {
      dropInFlight();
      setStatus(
        'error',
        'Internal error: the merged change could not be safely written back. Nothing was committed.',
      );
      return;
    }

    rebaseLocal(merged.value);
    await sleep(backoffDelayMs(attempt));
    await syncAttempt({
      text: mergedText,
      sha: fresh.value.sha,
      message,
      intendedBoard: merged.value,
      baseBoard: freshBoard,
      attempt: attempt + 1,
    });
  }

  /** Resolves an unmergeable conflict by discarding one side. */
  function resolveConflict(choice: 'keepMine' | 'keepTheirs'): Promise<void> {
    return enqueue(async () => {
      const current = conflict.value;
      if (!current) return;
      conflict.value = null;

      if (choice === 'keepTheirs') {
        // Read the file again instead of trusting `current.remote`: it may have changed again
        // since the conflict was raised. Newer local commands are applied on top of it.
        await performLoad();
        return;
      }

      confirm(current.remote, current.sha, current.baseText);
      inFlightCommands.value = current.commands;
      rebaseLocal(current.local);
      await writeBoard(current.local, current.message);
    });
  }

  /** Marks an editor draft as changed but not yet applied, or clears the mark. */
  function setDraftDirty(key: string, dirty: boolean): void {
    if (dirtyDrafts.value.has(key) === dirty) return;
    const next = new Set(dirtyDrafts.value);
    if (dirty) next.add(key);
    else next.delete(key);
    dirtyDrafts.value = next;
  }

  function showNotice(message: string): void {
    notice.value = message;
  }

  /** Forgets all state. Used before switching to another repository or file. */
  function reset(): void {
    clearPendingTimers();
    cancelRetry();
    retryCount = 0;
    confirmedBoard = emptyBoard();
    board.value = confirmedBoard;
    sha.value = null;
    baseText.value = null;
    pendingCommands.value = [];
    inFlightCommands.value = [];
    conflict.value = null;
    parseError.value = null;
    warnings.value = [];
    fileNotFound.value = false;
    unauthorized.value = false;
    notice.value = null;
    setStatus('idle');
  }

  function applyClientError(error: GithubClientError): void {
    if (error.type === 'Unauthorized' || error.type === 'Forbidden') unauthorized.value = true;
    if (error.type === 'InvalidUtf8') {
      // Shown and handled like a parse error: writes stay blocked until the file is fixed.
      parseError.value = { line: 0, reason: describeClientError(error) };
    }
    setStatus('error', describeClientError(error));
  }

  function domainErrorMessage(error: DomainError): string {
    switch (error.type) {
      case 'ItemNotFound':
        return 'That item no longer exists.';
      case 'DuplicateItemId':
        return 'An item with this id already exists.';
      case 'CompleteRequiresDescription':
        return 'A completed item must have a description.';
      case 'WrongStatus':
        return `That action requires the item to be ${error.expected}.`;
      case 'AlreadyDiscarded':
        return 'That item is already discarded.';
      case 'InvalidReorderIndex':
        return 'Reorder failed: index out of range.';
      case 'TagAlreadyExists':
        return `A tag named "${error.name}" already exists.`;
      case 'TagNotFound':
        return `Tag "${error.name}" no longer exists.`;
      case 'TagAlreadyOnItem':
        return 'That item already has this tag.';
      case 'TagNotOnItem':
        return 'That item does not have this tag.';
    }
  }

  return {
    board,
    sha,
    baseText,
    syncStatus,
    errorMessage,
    notice,
    parseError,
    warnings,
    fileNotFound,
    unauthorized,
    conflict,
    canWrite,
    hasUnsavedWork,
    load,
    refresh,
    flushNow,
    retryNow,
    initializeEmptyFile,
    applyAndSync,
    flushBeforeUnload,
    resolveConflict,
    setDraftDirty,
    showNotice,
    reset,
  };
});
