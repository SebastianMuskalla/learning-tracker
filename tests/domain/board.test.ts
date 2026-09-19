import { describe, expect, it } from 'vitest';
import { boardsEqual, emptyBoard, validateBoard } from '../../src/domain/board';
import {
  generateItemId,
  makeHeadline,
  makeHexColor,
  makeIsoTimestamp,
  makeTagName,
} from '../../src/domain/factories';
import { unwrap } from '../../src/domain/result';
import type { ActiveItem, Board, Tag } from '../../src/domain/types';

const CREATED = unwrap(makeIsoTimestamp('2026-09-01T00:00:00Z'));
const HEADLINE = unwrap(makeHeadline('x'));

function tag(name: string, color: string): Tag {
  return { name: unwrap(makeTagName(name)), color: unwrap(makeHexColor(color)) };
}

function activeItem(overrides: Partial<ActiveItem> = {}): ActiveItem {
  return {
    id: generateItemId(),
    headline: HEADLINE,
    createdAt: CREATED,
    status: 'active',
    description: null,
    tags: [],
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

  it('rejects an item that names a tag not defined on the board', () => {
    const vue = tag('vue', '#aacbee');
    const item = activeItem({ tags: [vue.name] });
    const board: Board = { ...emptyBoard(), new: [item] };
    const result = validateBoard(board);
    expect(result).toMatchObject({ ok: false, error: { type: 'UndefinedItemTag', id: item.id, name: 'vue' } });
  });

  it('rejects two tag definitions with the same name, ignoring case', () => {
    const board: Board = { ...emptyBoard(), tags: [tag('vue', '#aacbee'), tag('Vue', '#f6c9a4')] };
    const result = validateBoard(board);
    expect(result).toMatchObject({ ok: false, error: { type: 'DuplicateTagName' } });
  });

  it('rejects the same tag listed twice on one item', () => {
    const vue = tag('vue', '#aacbee');
    const item = activeItem({ tags: [vue.name, vue.name] });
    const board: Board = { ...emptyBoard(), tags: [vue], new: [item] };
    const result = validateBoard(board);
    expect(result).toMatchObject({ ok: false, error: { type: 'DuplicateItemTag', id: item.id, name: 'vue' } });
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

  it('is false when the tag list differs', () => {
    const a: Board = { ...emptyBoard(), tags: [tag('vue', '#aacbee')] };
    const b: Board = emptyBoard();
    expect(boardsEqual(a, b)).toBe(false);
  });

  it('is false when an item differs only in its tags', () => {
    const vue = tag('vue', '#aacbee');
    const item = activeItem();
    const a: Board = { ...emptyBoard(), tags: [vue], new: [item] };
    const b: Board = { ...emptyBoard(), tags: [vue], new: [{ ...item, tags: [vue.name] }] };
    expect(boardsEqual(a, b)).toBe(false);
  });
});
