import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyBoard } from '../../src/domain/board';
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
  it('happy path: fetches, parses, and stores the sha', async () => {
    const { board } = setup();
    getFile.mockResolvedValue({ ok: true, value: { text: serialize(emptyBoard()), sha: 'sha-1' } });

    await board.load();

    expect(board.syncStatus).toBe('saved');
    expect(board.sha).toBe('sha-1');
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
});

describe('applyAndSync — commit pipeline', () => {
  async function loaded(): Promise<ReturnType<typeof useBoardStore>> {
    const { board } = setup();
    getFile.mockResolvedValue({ ok: true, value: { text: serialize(emptyBoard()), sha: 'sha-1' } });
    await board.load();
    return board;
  }

  it('commits an add as a single write with the expected commit message', async () => {
    const board = await loaded();
    putFile.mockResolvedValue({ ok: true, value: { sha: 'sha-2' } });

    await board.applyAndSync({ type: 'add', headline: 'Rust ownership' as never });

    expect(board.board.new).toHaveLength(1);
    expect(putFile).toHaveBeenCalledTimes(1);
    const [, input] = putFile.mock.calls[0] as [unknown, { message: string; sha: string | null }];
    expect(input.message).toBe('Add "Rust ownership"');
    expect(input.sha).toBe('sha-1');
    expect(board.sha).toBe('sha-2');
    expect(board.syncStatus).toBe('saved');
  });

  it('409 once: rebases onto the fresh file and retries successfully', async () => {
    const board = await loaded();
    putFile
      .mockResolvedValueOnce({ ok: false, error: { type: 'Conflict' } })
      .mockResolvedValueOnce({ ok: true, value: { sha: 'sha-3' } });
    getFile.mockResolvedValueOnce({ ok: true, value: { text: serialize(emptyBoard()), sha: 'sha-2' } });

    await board.applyAndSync({ type: 'add', headline: 'Event sourcing' as never });

    expect(putFile).toHaveBeenCalledTimes(2);
    expect(board.syncStatus).toBe('saved');
    expect(board.sha).toBe('sha-3');
    expect(board.board.new.map((i) => i.headline)).toEqual(['Event sourcing']);
  });

  it('409 twice: surfaces a conflict instead of retrying forever', async () => {
    const board = await loaded();
    putFile.mockResolvedValue({ ok: false, error: { type: 'Conflict' } });
    getFile.mockResolvedValueOnce({ ok: true, value: { text: serialize(emptyBoard()), sha: 'sha-2' } });

    await board.applyAndSync({ type: 'add', headline: 'Event sourcing' as never });

    expect(putFile).toHaveBeenCalledTimes(2);
    expect(board.syncStatus).toBe('conflict');
  });

  it('aborts the write when the round-trip gate detects a mismatch, committing nothing', async () => {
    const board = await loaded();
    const before = board.board;
    parseSpy.mockReturnValueOnce({ ok: true, value: { board: emptyBoard(), warnings: [] } });

    await board.applyAndSync({ type: 'add', headline: 'Rust ownership' as never });

    expect(putFile).not.toHaveBeenCalled();
    expect(board.syncStatus).toBe('error');
    expect(board.board).toBe(before);
  });

  it('aborts the write and restores the previous board when the domain command is rejected', async () => {
    const board = await loaded();
    const before = board.board;

    await board.applyAndSync({ type: 'complete', id: 'not-a-real-id' as never });

    expect(putFile).not.toHaveBeenCalled();
    expect(board.syncStatus).toBe('error');
    expect(board.board).toBe(before);
  });
});
