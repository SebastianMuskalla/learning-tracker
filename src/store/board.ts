import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { boardsEqual, emptyBoard, validateBoard } from '../domain/board';
import type { Command, DomainError } from '../domain/commands';
import { applyCommand } from '../domain/commands';
import { findItemById, type Board, type ItemId, type Section } from '../domain/types';
import { commitMessage, INITIALIZE_MESSAGE } from '../format/commitMessage';
import { parse, type ParseError, type ParseWarning } from '../format/parse';
import { serialize } from '../format/serialize';
import { getFile, putFile } from '../github/client';
import type { GithubClientError, GithubRepoConfig } from '../github/types';
import { useSettingsStore } from './settings';

export type SyncStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error' | 'conflict';

const REORDER_DEBOUNCE_MS = 1000;

function commandItemId(command: Command): ItemId | undefined {
  return 'id' in command ? command.id : undefined;
}

export const useBoardStore = defineStore('board', () => {
  const settings = useSettingsStore();

  const board = ref<Board>(emptyBoard());
  const sha = ref<string | null>(null);
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

  let queue: Promise<void> = Promise.resolve();
  let pendingReorderTimer: ReturnType<typeof setTimeout> | null = null;

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
    queue = queue.then(job, job);
    return queue;
  }

  async function load(): Promise<void> {
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
    syncStatus.value = 'saved';
  }

  async function initializeEmptyFile(): Promise<void> {
    const empty = emptyBoard();
    const text = serialize(empty);
    const result = await putFile(config(), { text, sha: null, message: INITIALIZE_MESSAGE });
    if (!result.ok) {
      applyClientError(result.error);
      return;
    }
    board.value = empty;
    sha.value = result.value.sha;
    fileNotFound.value = false;
    syncStatus.value = 'saved';
  }

  function applyAndSync(command: Command): Promise<void> {
    if (command.type === 'reorder') {
      return applyReorderDebounced(command);
    }
    return enqueue(() => commit(command));
  }

  function applyReorderDebounced(command: Extract<Command, { type: 'reorder' }>): Promise<void> {
    const applied = applyCommand(board.value, command);
    if (!applied.ok) {
      errorMessage.value = domainErrorMessage(applied.error);
      syncStatus.value = 'error';
      return Promise.resolve();
    }
    board.value = applied.value;

    if (pendingReorderTimer !== null) clearTimeout(pendingReorderTimer);
    pendingReorderTimer = setTimeout(() => {
      pendingReorderTimer = null;
      void enqueue(() => flushReorder(command.section));
    }, REORDER_DEBOUNCE_MS);

    return Promise.resolve();
  }

  async function flushReorder(section: Section): Promise<void> {
    await writeBoard(board.value, `Reorder ${sectionLabel(section)}`, board.value);
  }

  async function commit(command: Command): Promise<void> {
    if (!canWrite.value) {
      errorMessage.value = 'Cannot write: learning.md failed to parse. Fix it on GitHub first.';
      syncStatus.value = 'error';
      return;
    }

    const previousBoard = board.value;
    const applied = applyCommand(previousBoard, command);
    if (!applied.ok) {
      errorMessage.value = domainErrorMessage(applied.error);
      syncStatus.value = 'error';
      return;
    }

    const id = commandItemId(command);
    const previousItem = id === undefined ? undefined : findItemById(previousBoard, id);
    const message = commitMessage(command, previousItem);

    await writeBoard(applied.value, message, previousBoard);
  }

  /** Serialises, round-trip-checks, and writes `nextBoard`, retrying once on a stale sha. */
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

    board.value = nextBoard;
    syncStatus.value = 'saving';

    const result = await putFile(config(), { text, sha: sha.value, message });
    if (result.ok) {
      sha.value = result.value.sha;
      syncStatus.value = 'saved';
      return;
    }

    if (result.error.type === 'Conflict') {
      await retryAfterConflict(nextBoard, message, previousBoard, text);
      return;
    }

    board.value = previousBoard;
    applyClientError(result.error);
  }

  async function retryAfterConflict(
    intendedBoard: Board,
    message: string,
    previousBoard: Board,
    firstAttemptText: string,
  ): Promise<void> {
    const fresh = await getFile(config());
    if (!fresh.ok) {
      board.value = previousBoard;
      applyClientError(fresh.error);
      return;
    }
    const freshParsed = parse(fresh.value.text);
    if (!freshParsed.ok) {
      board.value = previousBoard;
      parseError.value = freshParsed.error;
      syncStatus.value = 'error';
      return;
    }

    const retryText = boardsEqual(freshParsed.value.board, previousBoard)
      ? firstAttemptText
      : serialize(intendedBoard);
    const retryResult = await putFile(config(), { text: retryText, sha: fresh.value.sha, message });
    if (retryResult.ok) {
      board.value = intendedBoard;
      sha.value = retryResult.value.sha;
      syncStatus.value = 'saved';
      return;
    }

    board.value = previousBoard;
    sha.value = fresh.value.sha;
    if (retryResult.error.type === 'Conflict') {
      syncStatus.value = 'conflict';
      errorMessage.value = 'Someone else changed learning.md at the same time. Choose which version to keep.';
      conflict.value = { local: intendedBoard, remote: freshParsed.value.board, message };
      return;
    }
    applyClientError(retryResult.error);
  }

  /** Resolves a double-conflict by discarding one side. `sha` already holds the remote's current sha. */
  async function resolveConflict(choice: 'keepMine' | 'keepTheirs'): Promise<void> {
    const current = conflict.value;
    if (!current) return;
    conflict.value = null;

    if (choice === 'keepTheirs') {
      board.value = current.remote;
      syncStatus.value = 'saved';
      return;
    }

    await enqueue(() => writeBoard(current.local, current.message, current.remote));
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

  function sectionLabel(section: Section): string {
    switch (section) {
      case 'new':
        return 'New';
      case 'wip':
        return 'WIP';
      case 'complete':
        return 'Complete';
      case 'discarded':
        return 'Discarded';
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
    syncStatus,
    errorMessage,
    parseError,
    warnings,
    fileNotFound,
    unauthorized,
    conflict,
    canWrite,
    load,
    initializeEmptyFile,
    applyAndSync,
    resolveConflict,
    validate,
  };
});
