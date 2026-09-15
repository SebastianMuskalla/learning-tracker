import { describe, expect, it } from 'vitest';
import { emptyBoard, validateBoard } from '../../src/domain/board';
import { applyCommand, type Command } from '../../src/domain/commands';
import { generateItemId, makeHeadline, makeIsoDate, makeOptionalDescription } from '../../src/domain/factories';
import { unwrap } from '../../src/domain/result';
import type { Board } from '../../src/domain/types';

const DAY_1 = unwrap(makeIsoDate('2026-09-01'));
const DAY_2 = unwrap(makeIsoDate('2026-09-02'));

function headline(text: string) {
  return unwrap(makeHeadline(text));
}

function description(text: string) {
  const value = unwrap(makeOptionalDescription(text));
  if (value === null) throw new Error('expected a non-empty description in this test');
  return value;
}

function run(board: Board, command: Command, now = DAY_1): Board {
  const result = applyCommand(board, command, now);
  if (!result.ok) throw new Error(`command unexpectedly failed: ${JSON.stringify(result.error)}`);
  expect(validateBoard(result.value).ok).toBe(true);
  return result.value;
}

function first<T>(list: readonly T[]): T {
  const value = list[0];
  if (value === undefined) throw new Error('expected at least one item in this test board');
  return value;
}

describe('add', () => {
  it('prepends a new active item with no description', () => {
    const board = run(emptyBoard(), { type: 'add', headline: headline('Rust ownership') }, DAY_1);
    expect(board.new).toHaveLength(1);
    expect(first(board.new)).toMatchObject({
      headline: 'Rust ownership',
      status: 'active',
      description: null,
      createdAt: DAY_1,
    });
  });

  it('prepends, so the newest item is on top', () => {
    let board = emptyBoard();
    board = run(board, { type: 'add', headline: headline('First') });
    board = run(board, { type: 'add', headline: headline('Second') });
    expect(board.new.map((item) => item.headline)).toEqual(['Second', 'First']);
  });
});

describe('setDescription', () => {
  it('moves an item from New to WIP when a description is added', () => {
    let board = run(emptyBoard(), { type: 'add', headline: headline('Topic') });
    const id = first(board.new).id;
    board = run(board, { type: 'setDescription', id, description: description('notes') });
    expect(board.new).toHaveLength(0);
    expect(board.wip).toHaveLength(1);
    expect(first(board.wip).description).toBe('notes');
  });

  it('moves an item back from WIP to New when the description is cleared', () => {
    let board = run(emptyBoard(), { type: 'add', headline: headline('Topic') });
    const id = first(board.new).id;
    board = run(board, { type: 'setDescription', id, description: description('notes') });
    board = run(board, { type: 'setDescription', id, description: null });
    expect(board.wip).toHaveLength(0);
    expect(board.new).toHaveLength(1);
  });

  it('rejects clearing the description of a Complete item', () => {
    let board = run(emptyBoard(), { type: 'add', headline: headline('Topic') });
    const id = first(board.new).id;
    board = run(board, { type: 'setDescription', id, description: description('notes') });
    board = run(board, { type: 'complete', id }, DAY_2);
    const result = applyCommand(board, { type: 'setDescription', id, description: null });
    expect(result).toEqual({ ok: false, error: { type: 'CompleteRequiresDescription', id } });
  });

  it('updates a Discarded item description in place', () => {
    let board = run(emptyBoard(), { type: 'add', headline: headline('Topic') });
    const id = first(board.new).id;
    board = run(board, { type: 'discard', id }, DAY_2);
    board = run(board, { type: 'setDescription', id, description: description('why it was dropped') });
    expect(first(board.discarded).description).toBe('why it was dropped');
    expect(first(board.discarded).discardedAt).toBe(DAY_2);
  });
});

describe('complete / uncomplete', () => {
  it('rejects completing an item without a description', () => {
    const board = run(emptyBoard(), { type: 'add', headline: headline('Topic') });
    const id = first(board.new).id;
    const result = applyCommand(board, { type: 'complete', id });
    expect(result).toEqual({ ok: false, error: { type: 'CompleteRequiresDescription', id } });
  });

  it('moves a WIP item to Complete, stamping completedAt and dropping nothing else', () => {
    let board = run(emptyBoard(), { type: 'add', headline: headline('Topic') }, DAY_1);
    const id = first(board.new).id;
    board = run(board, { type: 'setDescription', id, description: description('notes') }, DAY_1);
    board = run(board, { type: 'complete', id }, DAY_2);
    expect(board.wip).toHaveLength(0);
    expect(first(board.complete)).toMatchObject({ id, completedAt: DAY_2, description: 'notes', createdAt: DAY_1 });
  });

  it('reopens a Complete item back to WIP', () => {
    let board = run(emptyBoard(), { type: 'add', headline: headline('Topic') });
    const id = first(board.new).id;
    board = run(board, { type: 'setDescription', id, description: description('notes') });
    board = run(board, { type: 'complete', id }, DAY_2);
    board = run(board, { type: 'uncomplete', id });
    expect(board.complete).toHaveLength(0);
    expect(first(board.wip)).toMatchObject({ id, status: 'active', description: 'notes' });
  });

  it('rejects uncompleting a non-Complete item', () => {
    const board = run(emptyBoard(), { type: 'add', headline: headline('Topic') });
    const id = first(board.new).id;
    const result = applyCommand(board, { type: 'uncomplete', id });
    expect(result).toEqual({ ok: false, error: { type: 'WrongStatus', id, expected: 'complete' } });
  });
});

describe('discard / restore', () => {
  it('discards a New item and drops nothing (no completedAt existed)', () => {
    let board = run(emptyBoard(), { type: 'add', headline: headline('Topic') }, DAY_1);
    const id = first(board.new).id;
    board = run(board, { type: 'discard', id }, DAY_2);
    expect(board.new).toHaveLength(0);
    expect(first(board.discarded)).toMatchObject({ id, discardedAt: DAY_2, description: null });
  });

  it('discarding a Complete item drops completedAt', () => {
    let board = run(emptyBoard(), { type: 'add', headline: headline('Topic') });
    const id = first(board.new).id;
    board = run(board, { type: 'setDescription', id, description: description('notes') });
    board = run(board, { type: 'complete', id }, DAY_1);
    board = run(board, { type: 'discard', id }, DAY_2);
    expect(first(board.discarded)).toEqual({
      id,
      headline: 'Topic',
      createdAt: DAY_1,
      status: 'discarded',
      description: 'notes',
      discardedAt: DAY_2,
    });
  });

  it('rejects discarding an already-discarded item', () => {
    let board = run(emptyBoard(), { type: 'add', headline: headline('Topic') });
    const id = first(board.new).id;
    board = run(board, { type: 'discard', id });
    const result = applyCommand(board, { type: 'discard', id });
    expect(result).toEqual({ ok: false, error: { type: 'AlreadyDiscarded', id } });
  });

  it('restores to New when there is no description, WIP when there is one', () => {
    let board = run(emptyBoard(), { type: 'add', headline: headline('bare') });
    const bareId = first(board.new).id;
    board = run(board, { type: 'add', headline: headline('with desc') });
    const describedId = first(board.new).id;
    board = run(board, { type: 'setDescription', id: describedId, description: description('notes') });

    board = run(board, { type: 'discard', id: bareId });
    board = run(board, { type: 'discard', id: describedId });

    board = run(board, { type: 'restore', id: bareId });
    board = run(board, { type: 'restore', id: describedId });

    expect(board.new.map((i) => i.id)).toContain(bareId);
    expect(board.wip.map((i) => i.id)).toContain(describedId);
  });
});

describe('reorder', () => {
  it('moves an item within its section', () => {
    let board = emptyBoard();
    board = run(board, { type: 'add', headline: headline('A') });
    board = run(board, { type: 'add', headline: headline('B') });
    board = run(board, { type: 'add', headline: headline('C') });
    // board.new is [C, B, A]
    board = run(board, { type: 'reorder', section: 'new', fromIndex: 0, toIndex: 2 });
    expect(board.new.map((i) => i.headline)).toEqual(['B', 'A', 'C']);
  });

  it('rejects out-of-range indices', () => {
    const board = run(emptyBoard(), { type: 'add', headline: headline('A') });
    const result = applyCommand(board, { type: 'reorder', section: 'new', fromIndex: 0, toIndex: 5 });
    expect(result.ok).toBe(false);
  });
});

describe('delete', () => {
  it('permanently removes a Discarded item', () => {
    let board = run(emptyBoard(), { type: 'add', headline: headline('Topic') });
    const id = first(board.new).id;
    board = run(board, { type: 'discard', id });
    board = run(board, { type: 'delete', id });
    expect(board.discarded).toHaveLength(0);
  });

  it('rejects deleting a non-Discarded item', () => {
    const board = run(emptyBoard(), { type: 'add', headline: headline('Topic') });
    const id = first(board.new).id;
    const result = applyCommand(board, { type: 'delete', id });
    expect(result).toEqual({ ok: false, error: { type: 'WrongStatus', id, expected: 'discarded' } });
  });
});

describe('unknown item', () => {
  it('every id-based command reports ItemNotFound for an unknown id', () => {
    const board = emptyBoard();
    const missing = generateItemId();
    const commands: Command[] = [
      { type: 'editHeadline', id: missing, headline: headline('x') },
      { type: 'setDescription', id: missing, description: null },
      { type: 'complete', id: missing },
      { type: 'uncomplete', id: missing },
      { type: 'discard', id: missing },
      { type: 'restore', id: missing },
      { type: 'delete', id: missing },
    ];
    for (const command of commands) {
      expect(applyCommand(board, command)).toEqual({ ok: false, error: { type: 'ItemNotFound', id: missing } });
    }
  });
});
