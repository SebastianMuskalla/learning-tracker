import { err, ok, type Result } from './result';
import { allItems, sectionOf, type Board, type Item } from './types';

export type BoardValidationError =
  | { readonly type: 'DuplicateId'; readonly id: string }
  | { readonly type: 'MisplacedItem'; readonly id: string; readonly expectedSection: string }
  | { readonly type: 'ActiveItemInWrongArray'; readonly id: string };

export function emptyBoard(): Board {
  return { new: [], wip: [], complete: [], discarded: [] };
}

export function validateBoard(board: Board): Result<Board, BoardValidationError> {
  const seen = new Set<string>();
  for (const item of allItems(board)) {
    if (seen.has(item.id)) {
      return err({ type: 'DuplicateId', id: item.id });
    }
    seen.add(item.id);
  }

  for (const item of board.new) {
    if (item.description !== null) {
      return err({ type: 'ActiveItemInWrongArray', id: item.id });
    }
  }
  for (const item of board.wip) {
    if (item.description === null) {
      return err({ type: 'ActiveItemInWrongArray', id: item.id });
    }
  }

  for (const item of allItems(board)) {
    const expected = sectionOf(item);
    const actual = whichSectionArray(board, item.id);
    if (actual !== expected) {
      return err({ type: 'MisplacedItem', id: item.id, expectedSection: expected });
    }
  }

  return ok(board);
}

function whichSectionArray(board: Board, id: string): 'new' | 'wip' | 'complete' | 'discarded' | undefined {
  if (board.new.some((item) => item.id === id)) return 'new';
  if (board.wip.some((item) => item.id === id)) return 'wip';
  if (board.complete.some((item) => item.id === id)) return 'complete';
  if (board.discarded.some((item) => item.id === id)) return 'discarded';
  return undefined;
}

export { sectionOf };

export function boardsEqual(a: Board, b: Board): boolean {
  return (
    itemListsEqual(a.new, b.new) &&
    itemListsEqual(a.wip, b.wip) &&
    itemListsEqual(a.complete, b.complete) &&
    itemListsEqual(a.discarded, b.discarded)
  );
}

function itemListsEqual(a: readonly Item[], b: readonly Item[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => itemsEqual(item, b[index]));
}

/** Exported for the merge algorithm, which also needs to compare two items for equality. */
export function itemsEqual(a: Item, b: Item | undefined): boolean {
  if (b?.status !== a.status) return false;
  if (a.id !== b.id || a.headline !== b.headline || a.createdAt !== b.createdAt || a.description !== b.description) {
    return false;
  }
  if (a.status === 'complete' && b.status === 'complete') return a.completedAt === b.completedAt;
  if (a.status === 'discarded' && b.status === 'discarded') return a.discardedAt === b.discardedAt;
  return true;
}
