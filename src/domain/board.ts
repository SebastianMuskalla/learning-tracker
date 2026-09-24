import { err, ok, type Result } from './result';
import { allItems, sectionOf, type Board, type Item, type Tag, type TagName } from './types';

export type BoardValidationError =
  | { readonly type: 'DuplicateId'; readonly id: string }
  | { readonly type: 'MisplacedItem'; readonly id: string; readonly expectedSection: string }
  | { readonly type: 'ActiveItemInWrongArray'; readonly id: string }
  | { readonly type: 'DuplicateTagName'; readonly name: string }
  | { readonly type: 'UndefinedItemTag'; readonly id: string; readonly name: string }
  | { readonly type: 'DuplicateItemTag'; readonly id: string; readonly name: string };

/** A short text for the user that explains a board validation error. */
export function describeBoardValidationError(error: BoardValidationError): string {
  switch (error.type) {
    case 'DuplicateId':
      return `the id ${error.id} is used by more than one item`;
    case 'MisplacedItem':
      return `item ${error.id} belongs in section ${error.expectedSection}`;
    case 'ActiveItemInWrongArray':
      return `item ${error.id} is in the wrong one of New and WIP`;
    case 'DuplicateTagName':
      return `the tag "${error.name}" is defined more than once`;
    case 'UndefinedItemTag':
      return `item ${error.id} uses the undefined tag "${error.name}"`;
    case 'DuplicateItemTag':
      return `item ${error.id} has the tag "${error.name}" more than once`;
  }
}

export function emptyBoard(): Board {
  return { tags: [], new: [], wip: [], complete: [], discarded: [] };
}

export function validateBoard(board: Board): Result<Board, BoardValidationError> {
  const seen = new Set<string>();
  for (const item of allItems(board)) {
    if (seen.has(item.id)) {
      return err({ type: 'DuplicateId', id: item.id });
    }
    seen.add(item.id);
  }

  const seenTagNamesLower = new Set<string>();
  for (const tag of board.tags) {
    const lower = tag.name.toLowerCase();
    if (seenTagNamesLower.has(lower)) {
      return err({ type: 'DuplicateTagName', name: tag.name });
    }
    seenTagNamesLower.add(lower);
  }

  const definedTagNames = new Set<TagName>(board.tags.map((tag) => tag.name));
  for (const item of allItems(board)) {
    const seenItemTags = new Set<TagName>();
    for (const name of item.tags) {
      if (!definedTagNames.has(name)) {
        return err({ type: 'UndefinedItemTag', id: item.id, name });
      }
      if (seenItemTags.has(name)) {
        return err({ type: 'DuplicateItemTag', id: item.id, name });
      }
      seenItemTags.add(name);
    }
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
    tagListsEqual(a.tags, b.tags) &&
    itemListsEqual(a.new, b.new) &&
    itemListsEqual(a.wip, b.wip) &&
    itemListsEqual(a.complete, b.complete) &&
    itemListsEqual(a.discarded, b.discarded)
  );
}

function tagListsEqual(a: readonly Tag[], b: readonly Tag[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((tag, index) => tag.name === b[index]?.name && tag.color === b[index].color);
}

function tagArraysEqual(a: readonly TagName[], b: readonly TagName[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((name, index) => name === b[index]);
}

function itemListsEqual(a: readonly Item[], b: readonly Item[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => itemsEqual(item, b[index]));
}

/** Exported for the merge algorithm, which also needs to compare two items for equality. */
export function itemsEqual(a: Item, b: Item | undefined): boolean {
  if (b?.status !== a.status) return false;
  if (
    a.id !== b.id ||
    a.headline !== b.headline ||
    a.createdAt !== b.createdAt ||
    a.description !== b.description
  ) {
    return false;
  }
  if (!tagArraysEqual(a.tags, b.tags)) return false;
  if (a.status === 'complete' && b.status === 'complete') return a.completedAt === b.completedAt;
  if (a.status === 'discarded' && b.status === 'discarded') return a.discardedAt === b.discardedAt;
  return true;
}
