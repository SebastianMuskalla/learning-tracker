import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyBoard } from '../../src/domain/board';
import { applyCommand } from '../../src/domain/commands';
import type { Board } from '../../src/domain/types';
import * as parseModule from '../../src/format/parse';
import { serialize } from '../../src/format/serialize';
import * as client from '../../src/github/client';
import { useBoardStore } from '../../src/store/board';
import { useSettingsStore } from '../../src/store/settings';

vi.mock('../../src/github/client', () => ({
  getFile: vi.fn(),
  putFile: vi.fn(),
}));

vi.mock('../../src/format/parse', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/format/parse')>();
  return { ...actual, parse: vi.fn(actual.parse) };
});

const getFile = client.getFile as ReturnType<typeof vi.fn>;
const putFile = client.putFile as ReturnType<typeof vi.fn>;
const parseSpy = parseModule.parse as ReturnType<typeof vi.fn>;

function setup(): { board: ReturnType<typeof useBoardStore>; settings: ReturnType<typeof useSettingsStore> } {
  setActivePinia(createPinia());
  const settings = useSettingsStore();
  settings.owner = 'me';
  settings.repo = 'learning-data';
  settings.branch = 'main';
  settings.path = 'learning.md';
  settings.token = 'test-token';
  const board = useBoardStore();
  return { board, settings };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('load', () => {
  it('happy path: fetches, parses, and stores the sha and base text', async () => {
    const { board } = setup();
    getFile.mockResolvedValue({ ok: true, value: { text: serialize(emptyBoard()), sha: 'sha-1' } });

    await board.load();

    expect(board.syncStatus).toBe('saved');
    expect(board.sha).toBe('sha-1');
    expect(board.baseText).toBe(serialize(emptyBoard()));
    expect(board.parseError).toBeNull();
  });

  it('401: surfaces Unauthorized and flags unauthorized', async () => {
    const { board } = setup();
    getFile.mockResolvedValue({ ok: false, error: { type: 'Unauthorized' } });

    await board.load();

    expect(board.syncStatus).toBe('error');
    expect(board.unauthorized).toBe(true);
  });

  it('404: offers to initialize instead of erroring', async () => {
    const { board } = setup();
    getFile.mockResolvedValue({ ok: false, error: { type: 'NotFound' } });

    await board.load();

    expect(board.fileNotFound).toBe(true);
    expect(board.syncStatus).not.toBe('error');
  });

  it('initializeEmptyFile writes an empty board once the file is missing', async () => {
    const { board } = setup();
    putFile.mockResolvedValue({ ok: true, value: { sha: 'new-sha' } });

    await board.initializeEmptyFile();

    expect(putFile).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'me', repo: 'learning-data' }),
      expect.objectContaining({ sha: null, message: 'Initialize learning.md' }),
    );
    expect(board.sha).toBe('new-sha');
    expect(board.fileNotFound).toBe(false);
  });

  it('does not read from the browser HTTP cache', async () => {
    const { board } = setup();
    getFile.mockResolvedValue({ ok: true, value: { text: serialize(emptyBoard()), sha: 'sha-1' } });

    await board.load();

    // getFile/putFile are mocked here, so this only pins the contract; the actual
    // `cache: 'no-store'` fetch option is covered directly in tests/github (client behaviour).
    expect(getFile).toHaveBeenCalledWith(expect.objectContaining({ owner: 'me' }));
  });

  it('refresh() is a no-op while there is unwritten local work', async () => {
    const { board } = setup();
    getFile.mockResolvedValue({ ok: true, value: { text: serialize(emptyBoard()), sha: 'sha-1' } });
    await board.load();
    getFile.mockClear();

    vi.useFakeTimers();
    await board.applyAndSync({ type: 'add', headline: 'Mine' as never });
    expect(board.syncStatus).toBe('pending');

    await board.refresh();

    expect(getFile).not.toHaveBeenCalled();
    expect(board.board.new.map((i) => i.headline)).toEqual(['Mine']);
    vi.useRealTimers();
  });
});

describe('applyAndSync — batching and the commit pipeline', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  async function loaded(): Promise<ReturnType<typeof useBoardStore>> {
    const { board } = setup();
    getFile.mockResolvedValue({ ok: true, value: { text: serialize(emptyBoard()), sha: 'sha-1' } });
    await board.load();
    return board;
  }

  function boardWithOneItem(headline: string): Board {
    const result = applyCommand(emptyBoard(), { type: 'add', headline: headline as never });
    if (!result.ok) throw new Error('unexpected domain error building test fixture');
    return result.value;
  }

  it('commits a single command as one write with the expected commit message, after the debounce settles', async () => {
    const board = await loaded();
    putFile.mockResolvedValue({ ok: true, value: { sha: 'sha-2' } });

    vi.useFakeTimers();
    await board.applyAndSync({ type: 'add', headline: 'Rust ownership' as never });
    expect(board.syncStatus).toBe('pending');
    expect(putFile).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();

    expect(board.board.new).toHaveLength(1);
    expect(putFile).toHaveBeenCalledTimes(1);
    const [, input] = putFile.mock.calls[0] as [unknown, { message: string; sha: string | null }];
    expect(input.message).toBe('Add "Rust ownership"');
    expect(input.sha).toBe('sha-1');
    expect(board.sha).toBe('sha-2');
    expect(board.syncStatus).toBe('saved');
  });

  it('batches several quick commands into one write with a combined commit message', async () => {
    const board = await loaded();
    putFile.mockResolvedValue({ ok: true, value: { sha: 'sha-2' } });

    vi.useFakeTimers();
    await board.applyAndSync({ type: 'add', headline: 'First' as never });
    await board.applyAndSync({ type: 'add', headline: 'Second' as never });
    await board.applyAndSync({ type: 'add', headline: 'Third' as never });
    expect(putFile).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();

    expect(putFile).toHaveBeenCalledTimes(1);
    const [, input] = putFile.mock.calls[0] as [unknown, { message: string }];
    expect(input.message).toContain('3 changes');
    expect(input.message).toContain('Add "First"');
    expect(input.message).toContain('Add "Second"');
    expect(input.message).toContain('Add "Third"');
    expect(board.board.new.map((i) => i.headline)).toEqual(['Third', 'Second', 'First']);
    expect(board.syncStatus).toBe('saved');
  });

  it('force-flushes once a batch reaches the hard cap of commands, without waiting for quiet', async () => {
    const board = await loaded();
    putFile.mockResolvedValue({ ok: true, value: { sha: 'sha-2' } });

    vi.useFakeTimers();
    for (let i = 0; i < 10; i += 1) {
      await board.applyAndSync({ type: 'add', headline: `Item ${String(i)}` as never });
    }
    // The 10th command hits the hard cap and queues a flush immediately (no 800ms wait needed).
    await vi.runAllTimersAsync();

    expect(putFile).toHaveBeenCalledTimes(1);
    expect(board.syncStatus).toBe('saved');
  });

  it('409 with a merely stale sha: reconciles against the fresh sha and retries successfully', async () => {
    const board = await loaded();
    putFile
      .mockResolvedValueOnce({ ok: false, error: { type: 'Conflict' } })
      .mockResolvedValueOnce({ ok: true, value: { sha: 'sha-3' } });
    // The remote content did not really change — the sha was just stale (e.g. replica lag).
    getFile.mockResolvedValueOnce({ ok: true, value: { text: serialize(emptyBoard()), sha: 'sha-2' } });

    vi.useFakeTimers();
    await board.applyAndSync({ type: 'add', headline: 'Event sourcing' as never });
    await vi.runAllTimersAsync();

    expect(putFile).toHaveBeenCalledTimes(2);
    expect(board.syncStatus).toBe('saved');
    expect(board.sha).toBe('sha-3');
    expect(board.board.new.map((i) => i.headline)).toEqual(['Event sourcing']);
  });

  it('409 where the fresh remote text already matches what we tried to write: adopts it without a second PUT', async () => {
    const board = await loaded();
    // Establish a known item id first, so the next write's exact bytes are predictable.
    putFile.mockResolvedValueOnce({ ok: true, value: { sha: 'sha-2' } });
    vi.useFakeTimers();
    await board.applyAndSync({ type: 'add', headline: 'Shared topic' as never });
    await vi.runAllTimersAsync();
    const [sharedItem] = board.board.new;
    if (!sharedItem) throw new Error('unexpected: no shared item in fixture');

    const attempted = applyCommand(board.board, {
      type: 'editHeadline',
      id: sharedItem.id,
      headline: 'Edited' as never,
    });
    if (!attempted.ok) throw new Error('unexpected domain error building test fixture');
    const attemptedText = serialize(attempted.value);

    putFile.mockClear();
    getFile.mockClear();
    putFile.mockResolvedValueOnce({ ok: false, error: { type: 'Conflict' } });
    // Models the PUT actually having landed (we just never saw the response) or a stale cached
    // read finally catching up: the fresh read echoes back exactly what we tried to write.
    getFile.mockResolvedValueOnce({ ok: true, value: { text: attemptedText, sha: 'sha-3' } });

    await board.applyAndSync({ type: 'editHeadline', id: sharedItem.id, headline: 'Edited' as never });
    await vi.runAllTimersAsync();

    expect(putFile).toHaveBeenCalledTimes(1);
    expect(getFile).toHaveBeenCalledTimes(1); // just the one reconcile read
    expect(board.syncStatus).toBe('saved');
    expect(board.sha).toBe('sha-3');
    expect(board.board.new.map((i) => i.headline)).toEqual(['Edited']);
  });

  it('409 with independent remote and local additions: merges both instead of conflicting', async () => {
    const board = await loaded();
    putFile
      .mockResolvedValueOnce({ ok: false, error: { type: 'Conflict' } })
      .mockResolvedValueOnce({ ok: true, value: { sha: 'sha-3' } });
    const remoteBoard = boardWithOneItem('Theirs');
    getFile.mockResolvedValueOnce({ ok: true, value: { text: serialize(remoteBoard), sha: 'sha-2' } });

    vi.useFakeTimers();
    await board.applyAndSync({ type: 'add', headline: 'Mine' as never });
    await vi.runAllTimersAsync();

    expect(board.syncStatus).toBe('saved');
    expect(board.conflict).toBeNull();
    expect(board.board.new.map((i) => i.headline).sort()).toEqual(['Mine', 'Theirs']);
  });

  it('409 on a genuine divergent edit (same item changed both places): surfaces the conflict dialog', async () => {
    const board = await loaded();
    // Establish a synced item both sides will then edit differently.
    putFile.mockResolvedValueOnce({ ok: true, value: { sha: 'sha-2' } });
    vi.useFakeTimers();
    await board.applyAndSync({ type: 'add', headline: 'Shared topic' as never });
    await vi.runAllTimersAsync();
    const [sharedItem] = board.board.new;
    if (!sharedItem) throw new Error('unexpected: no shared item in fixture');
    const sharedId = sharedItem.id;

    putFile.mockResolvedValue({ ok: false, error: { type: 'Conflict' } });
    const remoteBoard = applyCommand(board.board, {
      type: 'editHeadline',
      id: sharedId,
      headline: 'Theirs edit' as never,
    });
    if (!remoteBoard.ok) throw new Error('unexpected domain error building test fixture');
    getFile.mockResolvedValueOnce({ ok: true, value: { text: serialize(remoteBoard.value), sha: 'sha-3' } });

    await board.applyAndSync({ type: 'editHeadline', id: sharedId, headline: 'Mine edit' as never });
    await vi.runAllTimersAsync();

    expect(board.syncStatus).toBe('conflict');
    expect(board.conflict).not.toBeNull();
    expect(board.conflict?.local.new.map((i) => i.headline)).toEqual(['Mine edit']);
    expect(board.conflict?.remote.new.map((i) => i.headline)).toEqual(['Theirs edit']);
    // The board shown while the conflict is unresolved is the last known-good local state.
    expect(board.board.new.map((i) => i.headline)).toEqual(['Shared topic']);
  });

  it('resolveConflict("keepTheirs") adopts the remote board and clears the conflict', async () => {
    const board = await loaded();
    putFile.mockResolvedValueOnce({ ok: true, value: { sha: 'sha-2' } });
    vi.useFakeTimers();
    await board.applyAndSync({ type: 'add', headline: 'Shared topic' as never });
    await vi.runAllTimersAsync();
    const [sharedItem] = board.board.new;
    if (!sharedItem) throw new Error('unexpected: no shared item in fixture');
    const sharedId = sharedItem.id;

    putFile.mockResolvedValue({ ok: false, error: { type: 'Conflict' } });
    const remoteBoard = applyCommand(board.board, {
      type: 'editHeadline',
      id: sharedId,
      headline: 'Theirs edit' as never,
    });
    if (!remoteBoard.ok) throw new Error('unexpected domain error building test fixture');
    getFile.mockResolvedValueOnce({ ok: true, value: { text: serialize(remoteBoard.value), sha: 'sha-3' } });
    await board.applyAndSync({ type: 'editHeadline', id: sharedId, headline: 'Mine edit' as never });
    await vi.runAllTimersAsync();
    expect(board.conflict).not.toBeNull();

    await board.resolveConflict('keepTheirs');

    expect(board.conflict).toBeNull();
    expect(board.board.new.map((i) => i.headline)).toEqual(['Theirs edit']);
    expect(board.syncStatus).toBe('saved');
  });

  it('resolveConflict("keepMine") re-writes the local board against the current remote sha', async () => {
    const board = await loaded();
    putFile.mockResolvedValueOnce({ ok: true, value: { sha: 'sha-2' } });
    vi.useFakeTimers();
    await board.applyAndSync({ type: 'add', headline: 'Shared topic' as never });
    await vi.runAllTimersAsync();
    const [sharedItem] = board.board.new;
    if (!sharedItem) throw new Error('unexpected: no shared item in fixture');
    const sharedId = sharedItem.id;

    putFile.mockResolvedValue({ ok: false, error: { type: 'Conflict' } });
    const remoteBoard = applyCommand(board.board, {
      type: 'editHeadline',
      id: sharedId,
      headline: 'Theirs edit' as never,
    });
    if (!remoteBoard.ok) throw new Error('unexpected domain error building test fixture');
    getFile.mockResolvedValueOnce({ ok: true, value: { text: serialize(remoteBoard.value), sha: 'sha-3' } });
    await board.applyAndSync({ type: 'editHeadline', id: sharedId, headline: 'Mine edit' as never });
    await vi.runAllTimersAsync();
    expect(board.conflict).not.toBeNull();

    putFile.mockReset();
    putFile.mockResolvedValue({ ok: true, value: { sha: 'sha-4' } });
    await board.resolveConflict('keepMine');

    expect(putFile).toHaveBeenCalledTimes(1);
    const [, input] = putFile.mock.calls[0] as [unknown, { sha: string | null }];
    expect(input.sha).toBe('sha-3');
    expect(board.conflict).toBeNull();
    expect(board.sha).toBe('sha-4');
    expect(board.board.new.map((i) => i.headline)).toEqual(['Mine edit']);
    expect(board.syncStatus).toBe('saved');
  });

  it('a write whose text equals the current base text sends no request', async () => {
    const board = await loaded();
    putFile.mockResolvedValue({ ok: true, value: { sha: 'sha-2' } });
    vi.useFakeTimers();
    await board.applyAndSync({ type: 'add', headline: 'Solo' as never });
    await vi.runAllTimersAsync();
    expect(putFile).toHaveBeenCalledTimes(1);

    // A reorder that puts the (only) item back where it already was changes nothing on the wire.
    await board.applyAndSync({ type: 'reorder', section: 'new', fromIndex: 0, toIndex: 0 });
    await vi.runAllTimersAsync();

    expect(putFile).toHaveBeenCalledTimes(1);
    expect(board.syncStatus).toBe('saved');
    vi.useRealTimers();
  });

  it('aborts the write when the round-trip gate detects a mismatch, committing nothing', async () => {
    const board = await loaded();
    const before = board.board;
    parseSpy.mockReturnValueOnce({ ok: true, value: { board: emptyBoard(), warnings: [] } });

    vi.useFakeTimers();
    await board.applyAndSync({ type: 'add', headline: 'Rust ownership' as never });
    await vi.runAllTimersAsync();

    expect(putFile).not.toHaveBeenCalled();
    expect(board.syncStatus).toBe('error');
    expect(board.board).toBe(before);
  });

  it('aborts immediately and restores the previous board when the domain command is rejected', async () => {
    const board = await loaded();
    const before = board.board;

    await board.applyAndSync({ type: 'complete', id: 'not-a-real-id' as never });

    expect(putFile).not.toHaveBeenCalled();
    expect(board.syncStatus).toBe('error');
    expect(board.board).toBe(before);
  });
});

describe('flushBeforeUnload', () => {
  it('sends a best-effort keepalive write for pending work and clears the batch', async () => {
    const { board } = setup();
    getFile.mockResolvedValue({ ok: true, value: { text: serialize(emptyBoard()), sha: 'sha-1' } });
    await board.load();
    putFile.mockResolvedValue({ ok: true, value: { sha: 'sha-2' } });

    vi.useFakeTimers();
    await board.applyAndSync({ type: 'add', headline: 'Last minute' as never });
    expect(board.hasUnsavedWork).toBe(true);

    board.flushBeforeUnload();

    expect(putFile).toHaveBeenCalledTimes(1);
    const [, input] = putFile.mock.calls[0] as [unknown, { keepalive?: boolean }];
    expect(input.keepalive).toBe(true);

    // No further debounced flush should fire once the tab-close write went out.
    await vi.runAllTimersAsync();
    expect(putFile).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('does nothing when there is no pending work', () => {
    const { board } = setup();
    board.flushBeforeUnload();
    expect(putFile).not.toHaveBeenCalled();
  });
});

describe('hasUnsavedWork', () => {
  it('is false when idle and true while a batch is pending or saving', async () => {
    const { board } = setup();
    getFile.mockResolvedValue({ ok: true, value: { text: serialize(emptyBoard()), sha: 'sha-1' } });
    await board.load();
    expect(board.hasUnsavedWork).toBe(false);

    putFile.mockResolvedValue({ ok: true, value: { sha: 'sha-2' } });
    vi.useFakeTimers();
    await board.applyAndSync({ type: 'add', headline: 'Rust ownership' as never });
    expect(board.hasUnsavedWork).toBe(true);

    await vi.runAllTimersAsync();
    expect(board.hasUnsavedWork).toBe(false);
    vi.useRealTimers();
  });
});
