import { describe, expect, it } from 'vitest';
import { boardsEqual, emptyBoard, validateBoard } from '../../src/domain/board';
import { generateItemId, makeHeadline, makeIsoTimestamp } from '../../src/domain/factories';
import { unwrap } from '../../src/domain/result';
import type { ActiveItem, Board } from '../../src/domain/types';

const CREATED = unwrap(makeIsoTimestamp('2026-09-01T00:00:00Z'));
const HEADLINE = unwrap(makeHeadline('x'));

function activeItem(overrides: Partial<ActiveItem> = {}): ActiveItem {
  return {
    id: generateItemId(),
    headline: HEADLINE,
    createdAt: CREATED,
    status: 'active',
    description: null,
    ...overrides,
  };
}

describe('validateBoard', () => {
  it('accepts an empty board', () => {
    expect(validateBoard(emptyBoard()).ok).toBe(true);
  });

  it('rejects a New item that has a description', () => {
    const board: Board = { ...emptyBoard(), new: [activeItem({ description: 'oops' as never })] };
    const result = validateBoard(board);
    expect(result.ok).toBe(false);
  });

  it('rejects a WIP item that has no description', () => {
    const board: Board = { ...emptyBoard(), wip: [activeItem({ description: null })] };
    const result = validateBoard(board);
    expect(result.ok).toBe(false);
  });

  it('rejects duplicate ids across sections', () => {
    const item = activeItem();
    const board: Board = { ...emptyBoard(), new: [item], wip: [{ ...item, description: 'x' as never }] };
    const result = validateBoard(board);
    expect(result).toMatchObject({ ok: false, error: { type: 'DuplicateId', id: item.id } });
  });
});

describe('boardsEqual', () => {
  it('is true for structurally identical boards', () => {
    const item = activeItem();
    const a: Board = { ...emptyBoard(), new: [item] };
    const b: Board = { ...emptyBoard(), new: [{ ...item }] };
    expect(boardsEqual(a, b)).toBe(true);
  });

  it('is false when an item field differs', () => {
    const item = activeItem();
    const a: Board = { ...emptyBoard(), new: [item] };
    const b: Board = { ...emptyBoard(), new: [{ ...item, headline: 'different' as never }] };
    expect(boardsEqual(a, b)).toBe(false);
  });

  it('is false when list lengths differ', () => {
    const a: Board = { ...emptyBoard(), new: [activeItem()] };
    const b: Board = emptyBoard();
    expect(boardsEqual(a, b)).toBe(false);
  });
});
