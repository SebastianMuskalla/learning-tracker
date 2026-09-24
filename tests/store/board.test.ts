import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyBoard } from '../../src/domain/board';
import { applyCommand } from '../../src/domain/commands';
import { makeHeadline } from '../../src/domain/factories';
import { unwrap } from '../../src/domain/result';
import type { Board, Headline } from '../../src/domain/types';
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

const getFile = vi.mocked(client.getFile);
const putFile = vi.mocked(client.putFile);
const parseSpy = vi.mocked(parseModule.parse);

type GetResult = Awaited<ReturnType<typeof client.getFile>>;
type PutResult = Awaited<ReturnType<typeof client.putFile>>;

function callOrder(mockFn: { mock: { invocationCallOrder: number[] } }, index: number): number {
  const order = mockFn.mock.invocationCallOrder[index];
  if (order === undefined) throw new Error(`expected a recorded call at index ${String(index)}`);
  return order;
}

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
    board.applyAndSync({ type: 'add', headline: 'Mine' as never });
    expect(board.syncStatus).toBe('pending');

    await board.refresh();

    expect(getFile).not.toHaveBeenCalled();
    expect(board.board.new.map((i) => i.headline)).toEqual(['Mine']);
    vi.useRealTimers();
  });

  it('load() with pending work: flushes the pending batch (one putFile) before the reload read, and the reload reflects it', async () => {
    const { board } = setup();
    getFile.mockResolvedValueOnce({ ok: true, value: { text: serialize(emptyBoard()), sha: 'sha-1' } });
    await board.load();

    putFile.mockResolvedValueOnce({ ok: true, value: { sha: 'sha-2' } });
    vi.useFakeTimers();
    board.applyAndSync({ type: 'add', headline: 'Mine' as never });
    expect(board.syncStatus).toBe('pending');
    expect(putFile).not.toHaveBeenCalled();

    const reloaded = applyCommand(emptyBoard(), { type: 'add', headline: 'Mine' as never });
    if (!reloaded.ok) throw new Error('unexpected domain error building test fixture');
    getFile.mockResolvedValueOnce({ ok: true, value: { text: serialize(reloaded.value), sha: 'sha-3' } });

    await board.load();

    expect(putFile).toHaveBeenCalledTimes(1);
    expect(getFile).toHaveBeenCalledTimes(2);
    const putOrder = callOrder(putFile, 0);
    const reloadGetOrder = callOrder(getFile, 1);
    expect(putOrder).toBeLessThan(reloadGetOrder);
    expect(board.board.new.map((i) => i.headline)).toEqual(['Mine']);
    expect(board.sha).toBe('sha-3');
    vi.useRealTimers();
  });
});

describe('flushNow', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes immediately and resolves after the write', async () => {
    const { board } = setup();
    getFile.mockResolvedValueOnce({ ok: true, value: { text: serialize(emptyBoard()), sha: 'sha-1' } });
    await board.load();

    putFile.mockResolvedValueOnce({ ok: true, value: { sha: 'sha-2' } });
    vi.useFakeTimers();
    board.applyAndSync({ type: 'add', headline: 'Mine' as never });
    expect(putFile).not.toHaveBeenCalled();

    await board.flushNow();

    expect(putFile).toHaveBeenCalledTimes(1);
    expect(board.syncStatus).toBe('saved');
    expect(board.sha).toBe('sha-2');
  });

  it('does nothing when there is no pending work', async () => {
    const { board } = setup();
    getFile.mockResolvedValueOnce({ ok: true, value: { text: serialize(emptyBoard()), sha: 'sha-1' } });
    await board.load();

    await board.flushNow();

    expect(putFile).not.toHaveBeenCalled();
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
    board.applyAndSync({ type: 'add', headline: 'Rust ownership' as never });
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
    board.applyAndSync({ type: 'add', headline: 'First' as never });
    board.applyAndSync({ type: 'add', headline: 'Second' as never });
    board.applyAndSync({ type: 'add', headline: 'Third' as never });
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
      board.applyAndSync({ type: 'add', headline: `Item ${String(i)}` as never });
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
    board.applyAndSync({ type: 'add', headline: 'Event sourcing' as never });
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
    board.applyAndSync({ type: 'add', headline: 'Shared topic' as never });
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

    board.applyAndSync({ type: 'editHeadline', id: sharedItem.id, headline: 'Edited' as never });
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
    board.applyAndSync({ type: 'add', headline: 'Mine' as never });
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
    board.applyAndSync({ type: 'add', headline: 'Shared topic' as never });
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

    board.applyAndSync({ type: 'editHeadline', id: sharedId, headline: 'Mine edit' as never });
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
    board.applyAndSync({ type: 'add', headline: 'Shared topic' as never });
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
    board.applyAndSync({ type: 'editHeadline', id: sharedId, headline: 'Mine edit' as never });
    await vi.runAllTimersAsync();
    expect(board.conflict).not.toBeNull();

    // keepTheirs reads the file again instead of trusting the copy from when the conflict was raised.
    getFile.mockClear();
    getFile.mockResolvedValueOnce({ ok: true, value: { text: serialize(remoteBoard.value), sha: 'sha-3' } });
    await board.resolveConflict('keepTheirs');

    expect(getFile).toHaveBeenCalledTimes(1);
    expect(board.sha).toBe('sha-3');
    expect(board.conflict).toBeNull();
    expect(board.board.new.map((i) => i.headline)).toEqual(['Theirs edit']);
    expect(board.syncStatus).toBe('saved');
  });

  it('resolveConflict("keepMine") re-writes the local board against the current remote sha', async () => {
    const board = await loaded();
    putFile.mockResolvedValueOnce({ ok: true, value: { sha: 'sha-2' } });
    vi.useFakeTimers();
    board.applyAndSync({ type: 'add', headline: 'Shared topic' as never });
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
    board.applyAndSync({ type: 'editHeadline', id: sharedId, headline: 'Mine edit' as never });
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
    board.applyAndSync({ type: 'add', headline: 'Solo' as never });
    await vi.runAllTimersAsync();
    expect(putFile).toHaveBeenCalledTimes(1);

    // A reorder that puts the (only) item back where it already was changes nothing on the wire.
    board.applyAndSync({ type: 'reorder', section: 'new', fromIndex: 0, toIndex: 0 });
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
    board.applyAndSync({ type: 'add', headline: 'Rust ownership' as never });
    await vi.runAllTimersAsync();

    expect(putFile).not.toHaveBeenCalled();
    expect(board.syncStatus).toBe('error');
    expect(board.board).toBe(before);
  });

  it('aborts immediately and restores the previous board when the domain command is rejected', async () => {
    const board = await loaded();
    const before = board.board;

    board.applyAndSync({ type: 'complete', id: 'not-a-real-id' as never });

    expect(putFile).not.toHaveBeenCalled();
    expect(board.syncStatus).toBe('error');
    expect(board.board).toBe(before);
  });
});

describe('flushBeforeUnload', () => {
  it('sends a best-effort keepalive write for pending work and leaves the state as it is', async () => {
    const { board } = setup();
    getFile.mockResolvedValue({ ok: true, value: { text: serialize(emptyBoard()), sha: 'sha-1' } });
    await board.load();
    putFile.mockResolvedValue({ ok: true, value: { sha: 'sha-2' } });

    vi.useFakeTimers();
    board.applyAndSync({ type: 'add', headline: 'Last minute' as never });
    expect(board.hasUnsavedWork).toBe(true);

    board.flushBeforeUnload();

    expect(putFile).toHaveBeenCalledTimes(1);
    const [, input] = putFile.mock.calls[0] as [unknown, { keepalive?: boolean }];
    expect(input.keepalive).toBe(true);
    // Nothing is known about the result, so the work still counts as unsaved.
    expect(board.hasUnsavedWork).toBe(true);
    expect(board.syncStatus).toBe('pending');

    // If the page comes back from the back/forward cache, the normal flush still runs.
    await vi.runAllTimersAsync();
    expect(putFile).toHaveBeenCalledTimes(2);
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
    board.applyAndSync({ type: 'add', headline: 'Rust ownership' as never });
    expect(board.hasUnsavedWork).toBe(true);

    await vi.runAllTimersAsync();
    expect(board.hasUnsavedWork).toBe(false);
    vi.useRealTimers();
  });
});

function headline(text: string): Headline {
  return unwrap(makeHeadline(text));
}

/** The headlines in the New section of the text sent by the `index`-th PUT. */
function putHeadlines(index: number): string[] {
  const call = putFile.mock.calls[index] as [unknown, { text: string }] | undefined;
  if (!call) throw new Error(`expected a PUT at index ${String(index)}`);
  const parsed = parseModule.parse(call[1].text);
  if (!parsed.ok) throw new Error('PUT text did not parse');
  return parsed.value.board.new.map((i) => i.headline);
}

/** A promise that the test resolves by hand, to keep a request "in flight". */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('edits while a request is in flight (C1)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps an edit that was made while a PUT is in flight', async () => {
    vi.useFakeTimers();
    const { board } = setup();
    getFile.mockResolvedValue({ ok: true, value: { text: serialize(emptyBoard()), sha: 's1' } });
    await board.load();

    const firstPut = deferred<PutResult>();
    putFile.mockImplementationOnce(() => firstPut.promise);
    putFile.mockResolvedValue({ ok: true, value: { sha: 's3' } });

    board.applyAndSync({ type: 'add', headline: headline('A') });
    await vi.advanceTimersByTimeAsync(900); // the first PUT is now in flight
    board.applyAndSync({ type: 'add', headline: headline('B') });
    firstPut.resolve({ ok: true, value: { sha: 's2' } });
    await vi.advanceTimersByTimeAsync(2000);

    expect(board.board.new.map((i) => i.headline)).toEqual(['B', 'A']);
    expect(putFile).toHaveBeenCalledTimes(2);
    expect(putHeadlines(1)).toEqual(['B', 'A']);
    const [, second] = putFile.mock.calls[1] as [unknown, { sha: string }];
    expect(second.sha).toBe('s2');
    expect(board.syncStatus).toBe('saved');
  });

  it('keeps both edits when the in-flight PUT fails with a network error, and writes them on retry', async () => {
    vi.useFakeTimers();
    const { board } = setup();
    getFile.mockResolvedValue({ ok: true, value: { text: serialize(emptyBoard()), sha: 's1' } });
    await board.load();

    const firstPut = deferred<PutResult>();
    putFile.mockImplementationOnce(() => firstPut.promise);
    putFile.mockResolvedValue({ ok: true, value: { sha: 's2' } });

    board.applyAndSync({ type: 'add', headline: headline('A') });
    await vi.advanceTimersByTimeAsync(900);
    board.applyAndSync({ type: 'add', headline: headline('B') });
    firstPut.resolve({ ok: false, error: { type: 'Network', message: 'Failed to fetch' } });
    await vi.advanceTimersByTimeAsync(0);

    expect(board.board.new.map((i) => i.headline)).toEqual(['B', 'A']);
    expect(board.hasUnsavedWork).toBe(true);

    await vi.advanceTimersByTimeAsync(10_000);

    expect(putFile).toHaveBeenCalledTimes(2);
    expect(putHeadlines(1)).toEqual(['B', 'A']);
    expect(board.syncStatus).toBe('saved');
    expect(board.hasUnsavedWork).toBe(false);
  });

  it('keeps an edit that was made during a 409 and merge', async () => {
    vi.useFakeTimers();
    const { board } = setup();
    getFile.mockResolvedValueOnce({ ok: true, value: { text: serialize(emptyBoard()), sha: 's1' } });
    await board.load();

    const remote = unwrap(applyCommand(emptyBoard(), { type: 'add', headline: headline('Theirs') }));
    const reconcileRead = deferred<GetResult>();
    putFile.mockResolvedValueOnce({ ok: false, error: { type: 'Conflict' } });
    getFile.mockImplementationOnce(() => reconcileRead.promise);
    putFile.mockResolvedValue({ ok: true, value: { sha: 's3' } });

    board.applyAndSync({ type: 'add', headline: headline('A') });
    await vi.advanceTimersByTimeAsync(900); // the 409 arrived; the reconcile GET is in flight
    board.applyAndSync({ type: 'add', headline: headline('B') });
    reconcileRead.resolve({ ok: true, value: { text: serialize(remote), sha: 's2' } });
    await vi.advanceTimersByTimeAsync(5000);

    expect([...board.board.new.map((i) => i.headline)].sort()).toEqual(['A', 'B', 'Theirs']);
    expect([...putHeadlines(putFile.mock.calls.length - 1)].sort()).toEqual(['A', 'B', 'Theirs']);
    expect(board.syncStatus).toBe('saved');
  });

  it('keeps an edit that was made before the first load finished', async () => {
    vi.useFakeTimers();
    const { board } = setup();
    const remote = unwrap(applyCommand(emptyBoard(), { type: 'add', headline: headline('Theirs') }));
    const firstRead = deferred<GetResult>();
    getFile.mockImplementationOnce(() => firstRead.promise);
    putFile.mockResolvedValue({ ok: true, value: { sha: 's2' } });

    const loading = board.load();
    board.applyAndSync({ type: 'add', headline: headline('Mine') });
    firstRead.resolve({ ok: true, value: { text: serialize(remote), sha: 's1' } });
    await loading;

    expect(board.board.new.map((i) => i.headline)).toEqual(['Mine', 'Theirs']);
    await vi.advanceTimersByTimeAsync(2000);
    expect(putFile).toHaveBeenCalledTimes(1);
    expect(putHeadlines(0)).toEqual(['Mine', 'Theirs']);
  });

  it('keeps the id of a new item when its command is applied again', async () => {
    vi.useFakeTimers();
    const { board } = setup();
    getFile.mockResolvedValue({ ok: true, value: { text: serialize(emptyBoard()), sha: 's1' } });
    await board.load();
    const firstPut = deferred<PutResult>();
    putFile.mockImplementationOnce(() => firstPut.promise);
    putFile.mockResolvedValue({ ok: true, value: { sha: 's3' } });

    board.applyAndSync({ type: 'add', headline: headline('A') });
    await vi.advanceTimersByTimeAsync(900);
    board.applyAndSync({ type: 'add', headline: headline('B') });
    const idOfB = board.board.new[0]?.id;
    firstPut.resolve({ ok: true, value: { sha: 's2' } });
    await vi.advanceTimersByTimeAsync(0);

    expect(board.board.new[0]?.id).toBe(idOfB);
  });

  it('drops a pending command that no longer applies, and tells the user', async () => {
    vi.useFakeTimers();
    const { board } = setup();
    const base = unwrap(applyCommand(emptyBoard(), { type: 'add', headline: headline('Shared') }));
    getFile.mockResolvedValueOnce({ ok: true, value: { text: serialize(base), sha: 's1' } });
    await board.load();
    const sharedId = board.board.new[0]?.id;
    if (sharedId === undefined) throw new Error('fixture has no item');

    // GitHub deleted the item. Our in-flight write only adds an item, so the merge succeeds, but
    // the pending rename of the deleted item can no longer apply.
    const remote = emptyBoard();
    const reconcileRead = deferred<GetResult>();
    putFile.mockResolvedValueOnce({ ok: false, error: { type: 'Conflict' } });
    getFile.mockImplementationOnce(() => reconcileRead.promise);
    putFile.mockResolvedValue({ ok: true, value: { sha: 's3' } });

    board.applyAndSync({ type: 'add', headline: headline('New one') });
    await vi.advanceTimersByTimeAsync(900);
    board.applyAndSync({ type: 'editHeadline', id: sharedId, headline: headline('Renamed') });
    reconcileRead.resolve({ ok: true, value: { text: serialize(remote), sha: 's2' } });
    await vi.advanceTimersByTimeAsync(5000);

    expect(board.board.new.map((i) => i.headline)).toEqual(['New one']);
    expect(board.notice).toContain('dropped');
    expect(board.hasUnsavedWork).toBe(false);
  });
});

describe('refresh while the conflict dialog is open (C3)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  async function boardInConflict(): Promise<{ board: ReturnType<typeof useBoardStore>; theirs: Board }> {
    vi.useFakeTimers();
    const { board } = setup();
    const base = unwrap(applyCommand(emptyBoard(), { type: 'add', headline: headline('Shared') }));
    getFile.mockResolvedValueOnce({ ok: true, value: { text: serialize(base), sha: 's1' } });
    await board.load();
    const sharedId = board.board.new[0]?.id;
    if (sharedId === undefined) throw new Error('fixture has no item');

    const theirs = unwrap(
      applyCommand(base, { type: 'editHeadline', id: sharedId, headline: headline('Theirs') }),
    );
    putFile.mockResolvedValueOnce({ ok: false, error: { type: 'Conflict' } });
    getFile.mockResolvedValueOnce({ ok: true, value: { text: serialize(theirs), sha: 's2' } });
    board.applyAndSync({ type: 'editHeadline', id: sharedId, headline: headline('Mine') });
    await vi.advanceTimersByTimeAsync(2000);
    expect(board.syncStatus).toBe('conflict');
    return { board, theirs };
  }

  it('refresh() does nothing while a conflict is open', async () => {
    const { board } = await boardInConflict();
    getFile.mockClear();

    await board.refresh();

    expect(getFile).not.toHaveBeenCalled();
    expect(board.conflict).not.toBeNull();
    expect(board.hasUnsavedWork).toBe(true);
  });

  it('keepTheirs after a newer remote change: the next write builds on the newest version', async () => {
    const { board, theirs } = await boardInConflict();
    await board.refresh(); // skipped

    // GitHub changed again after the conflict was raised.
    const newest = unwrap(applyCommand(theirs, { type: 'add', headline: headline('Newer remote') }));
    getFile.mockResolvedValueOnce({ ok: true, value: { text: serialize(newest), sha: 's3' } });
    await board.resolveConflict('keepTheirs');
    expect(board.sha).toBe('s3');

    putFile.mockClear();
    putFile.mockResolvedValue({ ok: true, value: { sha: 's4' } });
    board.applyAndSync({ type: 'add', headline: headline('Next edit') });
    await vi.advanceTimersByTimeAsync(2000);

    expect(putFile).toHaveBeenCalledTimes(1);
    const [, input] = putFile.mock.calls[0] as [unknown, { sha: string }];
    expect(input.sha).toBe('s3');
    expect(putHeadlines(0)).toEqual(['Next edit', 'Newer remote', 'Theirs']);
  });

  it('a command made while the conflict is open waits, and is written after the choice', async () => {
    const { board, theirs } = await boardInConflict();
    putFile.mockClear();
    board.applyAndSync({ type: 'add', headline: headline('During conflict') });
    await vi.advanceTimersByTimeAsync(2000);
    expect(putFile).not.toHaveBeenCalled();
    expect(board.syncStatus).toBe('conflict');

    getFile.mockResolvedValueOnce({ ok: true, value: { text: serialize(theirs), sha: 's2' } });
    putFile.mockResolvedValue({ ok: true, value: { sha: 's3' } });
    await board.resolveConflict('keepTheirs');
    await vi.advanceTimersByTimeAsync(2000);

    expect(putFile).toHaveBeenCalledTimes(1);
    expect(putHeadlines(0)).toEqual(['During conflict', 'Theirs']);
    expect(board.syncStatus).toBe('saved');
  });
});

describe('write errors (E1)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  async function loadedWithFakeTimers(): Promise<ReturnType<typeof useBoardStore>> {
    vi.useFakeTimers();
    const { board } = setup();
    getFile.mockResolvedValue({ ok: true, value: { text: serialize(emptyBoard()), sha: 's1' } });
    await board.load();
    return board;
  }

  it('network error: keeps the change, says it will retry, and retries with backoff', async () => {
    const board = await loadedWithFakeTimers();
    putFile
      .mockResolvedValueOnce({ ok: false, error: { type: 'Network', message: 'Failed to fetch' } })
      .mockResolvedValueOnce({ ok: false, error: { type: 'Network', message: 'Failed to fetch' } })
      .mockResolvedValue({ ok: true, value: { sha: 's2' } });

    board.applyAndSync({ type: 'add', headline: headline('Mine') });
    await vi.advanceTimersByTimeAsync(900);

    expect(board.syncStatus).toBe('error');
    expect(board.errorMessage).toContain('will retry');
    expect(board.board.new.map((i) => i.headline)).toEqual(['Mine']);
    expect(board.hasUnsavedWork).toBe(true);

    await vi.advanceTimersByTimeAsync(2000); // first retry, fails again
    expect(putFile).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4000); // not yet: the second delay is 5 s
    expect(putFile).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(putFile).toHaveBeenCalledTimes(3);
    expect(board.syncStatus).toBe('saved');
    expect(board.errorMessage).toBeNull();
  });

  it('5xx: keeps the change like a network error', async () => {
    const board = await loadedWithFakeTimers();
    putFile.mockResolvedValueOnce({
      ok: false,
      error: { type: 'Unknown', status: 502, message: 'Bad gateway' },
    });

    board.applyAndSync({ type: 'add', headline: headline('Mine') });
    await vi.advanceTimersByTimeAsync(900);

    expect(board.syncStatus).toBe('error');
    expect(board.board.new.map((i) => i.headline)).toEqual(['Mine']);
    expect(board.hasUnsavedWork).toBe(true);
  });

  it('retryNow() writes at once after an error (used for the online event)', async () => {
    const board = await loadedWithFakeTimers();
    putFile
      .mockResolvedValueOnce({ ok: false, error: { type: 'Network', message: 'offline' } })
      .mockResolvedValue({ ok: true, value: { sha: 's2' } });
    board.applyAndSync({ type: 'add', headline: headline('Mine') });
    await vi.advanceTimersByTimeAsync(900);
    expect(board.syncStatus).toBe('error');

    await board.retryNow();

    expect(putFile).toHaveBeenCalledTimes(2);
    expect(board.syncStatus).toBe('saved');
  });

  it('401: keeps the change and flags unauthorized, without automatic retries', async () => {
    const board = await loadedWithFakeTimers();
    putFile.mockResolvedValue({ ok: false, error: { type: 'Unauthorized' } });

    board.applyAndSync({ type: 'add', headline: headline('Mine') });
    await vi.advanceTimersByTimeAsync(900);

    expect(board.unauthorized).toBe(true);
    expect(board.board.new.map((i) => i.headline)).toEqual(['Mine']);
    expect(board.hasUnsavedWork).toBe(true);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(putFile).toHaveBeenCalledTimes(1);

    // Once a new token is saved, the next load writes the kept change first.
    putFile.mockResolvedValue({ ok: true, value: { sha: 's2' } });
    await board.load();
    expect(putFile).toHaveBeenCalledTimes(2);
    expect(putHeadlines(1)).toEqual(['Mine']);
  });

  it('403 without rate-limit headers (Forbidden): keeps the change and flags unauthorized', async () => {
    const board = await loadedWithFakeTimers();
    putFile.mockResolvedValue({
      ok: false,
      error: { type: 'Forbidden', message: 'Resource not accessible' },
    });

    board.applyAndSync({ type: 'add', headline: headline('Mine') });
    await vi.advanceTimersByTimeAsync(900);

    expect(board.unauthorized).toBe(true);
    expect(board.errorMessage).toContain('Read and write');
    expect(board.hasUnsavedWork).toBe(true);
  });

  it('a permanent error (404 on write) rolls the change back', async () => {
    const board = await loadedWithFakeTimers();
    putFile.mockResolvedValue({ ok: false, error: { type: 'NotFound' } });

    board.applyAndSync({ type: 'add', headline: headline('Mine') });
    await vi.advanceTimersByTimeAsync(900);

    expect(board.syncStatus).toBe('error');
    expect(board.board.new).toEqual([]);
    expect(board.hasUnsavedWork).toBe(false);
  });

  it('rate limit with a short Retry-After: waits inside the queue and retries', async () => {
    const board = await loadedWithFakeTimers();
    putFile
      .mockResolvedValueOnce({ ok: false, error: { type: 'RateLimited', retryAfterSeconds: 3 } })
      .mockResolvedValue({ ok: true, value: { sha: 's2' } });

    board.applyAndSync({ type: 'add', headline: headline('Mine') });
    await vi.advanceTimersByTimeAsync(900);
    expect(putFile).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(putFile).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1100);
    expect(putFile).toHaveBeenCalledTimes(2);
    expect(board.syncStatus).toBe('saved');
  });

  it('rate limit without Retry-After: uses the short backoff', async () => {
    const board = await loadedWithFakeTimers();
    putFile
      .mockResolvedValueOnce({ ok: false, error: { type: 'RateLimited', retryAfterSeconds: null } })
      .mockResolvedValue({ ok: true, value: { sha: 's2' } });

    board.applyAndSync({ type: 'add', headline: headline('Mine') });
    await vi.advanceTimersByTimeAsync(900 + 400);

    expect(putFile).toHaveBeenCalledTimes(2);
    expect(board.syncStatus).toBe('saved');
  });

  it('rate limit with a long Retry-After: stops, keeps the work, frees the queue, and retries later', async () => {
    const board = await loadedWithFakeTimers();
    putFile
      .mockResolvedValueOnce({ ok: false, error: { type: 'RateLimited', retryAfterSeconds: 120 } })
      .mockResolvedValue({ ok: true, value: { sha: 's2' } });

    board.applyAndSync({ type: 'add', headline: headline('Mine') });
    await vi.advanceTimersByTimeAsync(900);

    expect(board.syncStatus).toBe('error');
    expect(board.errorMessage).toContain('will retry at');
    expect(board.hasUnsavedWork).toBe(true);
    // The queue is not blocked: a refresh runs (and skips itself because of the pending work).
    await board.refresh();

    await vi.advanceTimersByTimeAsync(119_000);
    expect(putFile).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(putFile).toHaveBeenCalledTimes(2);
    expect(board.syncStatus).toBe('saved');
  });
});

describe('error messages (E3)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears the error message after a later successful write', async () => {
    vi.useFakeTimers();
    const { board } = setup();
    getFile.mockResolvedValue({ ok: true, value: { text: serialize(emptyBoard()), sha: 's1' } });
    await board.load();
    putFile
      .mockResolvedValueOnce({ ok: false, error: { type: 'Network', message: 'Failed to fetch' } })
      .mockResolvedValue({ ok: true, value: { sha: 's2' } });

    board.applyAndSync({ type: 'add', headline: headline('Mine') });
    await vi.advanceTimersByTimeAsync(900);
    expect(board.errorMessage).not.toBeNull();

    board.applyAndSync({ type: 'add', headline: headline('Second') });
    await vi.advanceTimersByTimeAsync(900);

    expect(board.syncStatus).toBe('saved');
    expect(board.errorMessage).toBeNull();
  });
});

describe('invalid UTF-8 (E5)', () => {
  it('blocks writes like a parse error', async () => {
    const { board } = setup();
    getFile.mockResolvedValue({ ok: false, error: { type: 'InvalidUtf8' } });

    await board.load();

    expect(board.canWrite).toBe(false);
    expect(board.parseError?.reason).toContain('UTF-8');
  });
});

describe('reset (C5)', () => {
  it('forgets the board, the sha, and pending work', async () => {
    vi.useFakeTimers();
    const { board } = setup();
    getFile.mockResolvedValue({ ok: true, value: { text: serialize(emptyBoard()), sha: 's1' } });
    await board.load();
    board.applyAndSync({ type: 'add', headline: headline('Mine') });

    board.reset();
    await vi.runAllTimersAsync();

    expect(board.board.new).toEqual([]);
    expect(board.sha).toBeNull();
    expect(board.baseText).toBeNull();
    expect(board.hasUnsavedWork).toBe(false);
    expect(board.syncStatus).toBe('idle');
    expect(putFile).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('hasUnsavedWork (C4)', () => {
  it('is true while an editor has a draft that is not saved yet', () => {
    const { board } = setup();
    expect(board.hasUnsavedWork).toBe(false);

    board.setDraftDirty('drawer-description', true);
    expect(board.hasUnsavedWork).toBe(true);

    board.setDraftDirty('drawer-description', false);
    expect(board.hasUnsavedWork).toBe(false);
  });
});

describe('flushBeforeUnload (C2)', () => {
  it('skips the keepalive write when the change would not survive the round-trip check', async () => {
    const { board } = setup();
    getFile.mockResolvedValue({ ok: true, value: { text: serialize(emptyBoard()), sha: 's1' } });
    await board.load();
    vi.useFakeTimers();
    board.applyAndSync({ type: 'add', headline: headline('Mine') });
    parseSpy.mockReturnValueOnce({ ok: true, value: { board: emptyBoard(), warnings: [] } });

    board.flushBeforeUnload();

    expect(putFile).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('does nothing while a conflict is open', async () => {
    vi.useFakeTimers();
    const { board } = setup();
    const base = unwrap(applyCommand(emptyBoard(), { type: 'add', headline: headline('Shared') }));
    getFile.mockResolvedValueOnce({ ok: true, value: { text: serialize(base), sha: 's1' } });
    await board.load();
    const sharedId = board.board.new[0]?.id;
    if (sharedId === undefined) throw new Error('fixture has no item');
    const theirs = unwrap(
      applyCommand(base, { type: 'editHeadline', id: sharedId, headline: headline('Theirs') }),
    );
    putFile.mockResolvedValueOnce({ ok: false, error: { type: 'Conflict' } });
    getFile.mockResolvedValueOnce({ ok: true, value: { text: serialize(theirs), sha: 's2' } });
    board.applyAndSync({ type: 'editHeadline', id: sharedId, headline: headline('Mine') });
    await vi.advanceTimersByTimeAsync(2000);
    putFile.mockClear();

    board.flushBeforeUnload();

    expect(putFile).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
