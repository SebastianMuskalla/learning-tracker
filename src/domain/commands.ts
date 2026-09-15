import { generateItemId, today } from './factories';
import { err, ok, type Result } from './result';
import type {
  ActiveItem,
  Board,
  CompleteItem,
  Description,
  DiscardedItem,
  Headline,
  Item,
  IsoDate,
  ItemId,
  Section,
} from './types';

export type Command =
  | { readonly type: 'add'; readonly headline: Headline }
  | { readonly type: 'editHeadline'; readonly id: ItemId; readonly headline: Headline }
  | { readonly type: 'setDescription'; readonly id: ItemId; readonly description: Description | null }
  | { readonly type: 'complete'; readonly id: ItemId }
  | { readonly type: 'uncomplete'; readonly id: ItemId }
  | { readonly type: 'discard'; readonly id: ItemId }
  | { readonly type: 'restore'; readonly id: ItemId }
  | { readonly type: 'reorder'; readonly section: Section; readonly fromIndex: number; readonly toIndex: number }
  | { readonly type: 'delete'; readonly id: ItemId };

export type DomainError =
  | { readonly type: 'ItemNotFound'; readonly id: ItemId }
  | { readonly type: 'CompleteRequiresDescription'; readonly id: ItemId }
  | { readonly type: 'WrongStatus'; readonly id: ItemId; readonly expected: Item['status'] }
  | { readonly type: 'AlreadyDiscarded'; readonly id: ItemId }
  | { readonly type: 'InvalidReorderIndex'; readonly section: Section; readonly index: number };

type Located =
  | { readonly section: 'new'; readonly index: number; readonly item: ActiveItem }
  | { readonly section: 'wip'; readonly index: number; readonly item: ActiveItem }
  | { readonly section: 'complete'; readonly index: number; readonly item: CompleteItem }
  | { readonly section: 'discarded'; readonly index: number; readonly item: DiscardedItem };

function locate(board: Board, id: ItemId): Located | undefined {
  const newIndex = board.new.findIndex((item) => item.id === id);
  const newItem = board.new.find((item) => item.id === id);
  if (newIndex !== -1 && newItem) return { section: 'new', index: newIndex, item: newItem };

  const wipIndex = board.wip.findIndex((item) => item.id === id);
  const wipItem = board.wip.find((item) => item.id === id);
  if (wipIndex !== -1 && wipItem) return { section: 'wip', index: wipIndex, item: wipItem };

  const completeIndex = board.complete.findIndex((item) => item.id === id);
  const completeItem = board.complete.find((item) => item.id === id);
  if (completeIndex !== -1 && completeItem) return { section: 'complete', index: completeIndex, item: completeItem };

  const discardedIndex = board.discarded.findIndex((item) => item.id === id);
  const discardedItem = board.discarded.find((item) => item.id === id);
  if (discardedIndex !== -1 && discardedItem) {
    return { section: 'discarded', index: discardedIndex, item: discardedItem };
  }

  return undefined;
}

function removeAt(board: Board, located: Located): Board {
  switch (located.section) {
    case 'new':
      return { ...board, new: board.new.filter((_, i) => i !== located.index) };
    case 'wip':
      return { ...board, wip: board.wip.filter((_, i) => i !== located.index) };
    case 'complete':
      return { ...board, complete: board.complete.filter((_, i) => i !== located.index) };
    case 'discarded':
      return { ...board, discarded: board.discarded.filter((_, i) => i !== located.index) };
  }
}

function prependNew(board: Board, item: ActiveItem): Board {
  return { ...board, new: [item, ...board.new] };
}

function prependWip(board: Board, item: ActiveItem): Board {
  return { ...board, wip: [item, ...board.wip] };
}

function prependComplete(board: Board, item: CompleteItem): Board {
  return { ...board, complete: [item, ...board.complete] };
}

function prependDiscarded(board: Board, item: DiscardedItem): Board {
  return { ...board, discarded: [item, ...board.discarded] };
}

export function applyCommand(board: Board, command: Command, now: IsoDate = today()): Result<Board, DomainError> {
  switch (command.type) {
    case 'add':
      return applyAdd(board, command.headline, now);
    case 'editHeadline':
      return applyEditHeadline(board, command.id, command.headline);
    case 'setDescription':
      return applySetDescription(board, command.id, command.description);
    case 'complete':
      return applyComplete(board, command.id, now);
    case 'uncomplete':
      return applyUncomplete(board, command.id);
    case 'discard':
      return applyDiscard(board, command.id, now);
    case 'restore':
      return applyRestore(board, command.id);
    case 'reorder':
      return applyReorder(board, command.section, command.fromIndex, command.toIndex);
    case 'delete':
      return applyDelete(board, command.id);
  }
}

function applyAdd(board: Board, headline: Headline, now: IsoDate): Result<Board, DomainError> {
  const item: ActiveItem = {
    id: generateItemId(),
    headline,
    createdAt: now,
    status: 'active',
    description: null,
  };
  return ok(prependNew(board, item));
}

function applyEditHeadline(board: Board, id: ItemId, headline: Headline): Result<Board, DomainError> {
  const located = locate(board, id);
  if (!located) return err({ type: 'ItemNotFound', id });
  switch (located.section) {
    case 'new':
      return ok({ ...board, new: replaceAt(board.new, located.index, { ...located.item, headline }) });
    case 'wip':
      return ok({ ...board, wip: replaceAt(board.wip, located.index, { ...located.item, headline }) });
    case 'complete':
      return ok({ ...board, complete: replaceAt(board.complete, located.index, { ...located.item, headline }) });
    case 'discarded':
      return ok({ ...board, discarded: replaceAt(board.discarded, located.index, { ...located.item, headline }) });
  }
}

function applySetDescription(
  board: Board,
  id: ItemId,
  description: Description | null,
): Result<Board, DomainError> {
  const located = locate(board, id);
  if (!located) return err({ type: 'ItemNotFound', id });

  switch (located.section) {
    case 'complete': {
      if (description === null) {
        return err({ type: 'CompleteRequiresDescription', id });
      }
      return ok({ ...board, complete: replaceAt(board.complete, located.index, { ...located.item, description }) });
    }
    case 'discarded':
      return ok({
        ...board,
        discarded: replaceAt(board.discarded, located.index, { ...located.item, description }),
      });
    case 'new':
    case 'wip': {
      // Active: moves between New/WIP automatically when the section changes.
      const updated: ActiveItem = { ...located.item, description };
      const targetSection: Section = description === null ? 'new' : 'wip';
      if (targetSection === located.section) {
        return located.section === 'new'
          ? ok({ ...board, new: replaceAt(board.new, located.index, updated) })
          : ok({ ...board, wip: replaceAt(board.wip, located.index, updated) });
      }
      const withoutOld = removeAt(board, located);
      return ok(targetSection === 'new' ? prependNew(withoutOld, updated) : prependWip(withoutOld, updated));
    }
  }
}

function applyComplete(board: Board, id: ItemId, now: IsoDate): Result<Board, DomainError> {
  const located = locate(board, id);
  if (!located) return err({ type: 'ItemNotFound', id });
  if (located.section !== 'new' && located.section !== 'wip') {
    return err({ type: 'WrongStatus', id, expected: 'active' });
  }
  if (located.item.description === null) {
    return err({ type: 'CompleteRequiresDescription', id });
  }
  const completeItem: CompleteItem = {
    id: located.item.id,
    headline: located.item.headline,
    createdAt: located.item.createdAt,
    status: 'complete',
    description: located.item.description,
    completedAt: now,
  };
  return ok(prependComplete(removeAt(board, located), completeItem));
}

function applyUncomplete(board: Board, id: ItemId): Result<Board, DomainError> {
  const located = locate(board, id);
  if (!located) return err({ type: 'ItemNotFound', id });
  if (located.section !== 'complete') {
    return err({ type: 'WrongStatus', id, expected: 'complete' });
  }
  const activeItem: ActiveItem = {
    id: located.item.id,
    headline: located.item.headline,
    createdAt: located.item.createdAt,
    status: 'active',
    description: located.item.description,
  };
  return ok(prependWip(removeAt(board, located), activeItem));
}

function applyDiscard(board: Board, id: ItemId, now: IsoDate): Result<Board, DomainError> {
  const located = locate(board, id);
  if (!located) return err({ type: 'ItemNotFound', id });
  if (located.section === 'discarded') {
    return err({ type: 'AlreadyDiscarded', id });
  }
  const discardedItem: DiscardedItem = {
    id: located.item.id,
    headline: located.item.headline,
    createdAt: located.item.createdAt,
    status: 'discarded',
    description: located.item.description,
    discardedAt: now,
  };
  return ok(prependDiscarded(removeAt(board, located), discardedItem));
}

function applyRestore(board: Board, id: ItemId): Result<Board, DomainError> {
  const located = locate(board, id);
  if (!located) return err({ type: 'ItemNotFound', id });
  if (located.section !== 'discarded') {
    return err({ type: 'WrongStatus', id, expected: 'discarded' });
  }
  const activeItem: ActiveItem = {
    id: located.item.id,
    headline: located.item.headline,
    createdAt: located.item.createdAt,
    status: 'active',
    description: located.item.description,
  };
  const withoutOld = removeAt(board, located);
  return ok(located.item.description === null ? prependNew(withoutOld, activeItem) : prependWip(withoutOld, activeItem));
}

function reorderList<T>(list: readonly T[], fromIndex: number, toIndex: number): T[] | undefined {
  if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length) {
    return undefined;
  }
  const moved = list.at(fromIndex);
  if (moved === undefined) return undefined;
  const copy = list.slice();
  copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, moved);
  return copy;
}

function applyReorder(
  board: Board,
  section: Section,
  fromIndex: number,
  toIndex: number,
): Result<Board, DomainError> {
  switch (section) {
    case 'new': {
      const reordered = reorderList(board.new, fromIndex, toIndex);
      if (!reordered) return err({ type: 'InvalidReorderIndex', section, index: fromIndex });
      return ok({ ...board, new: reordered });
    }
    case 'wip': {
      const reordered = reorderList(board.wip, fromIndex, toIndex);
      if (!reordered) return err({ type: 'InvalidReorderIndex', section, index: fromIndex });
      return ok({ ...board, wip: reordered });
    }
    case 'complete': {
      const reordered = reorderList(board.complete, fromIndex, toIndex);
      if (!reordered) return err({ type: 'InvalidReorderIndex', section, index: fromIndex });
      return ok({ ...board, complete: reordered });
    }
    case 'discarded': {
      const reordered = reorderList(board.discarded, fromIndex, toIndex);
      if (!reordered) return err({ type: 'InvalidReorderIndex', section, index: fromIndex });
      return ok({ ...board, discarded: reordered });
    }
  }
}

function applyDelete(board: Board, id: ItemId): Result<Board, DomainError> {
  const located = locate(board, id);
  if (!located) return err({ type: 'ItemNotFound', id });
  if (located.section !== 'discarded') {
    return err({ type: 'WrongStatus', id, expected: 'discarded' });
  }
  return ok(removeAt(board, located));
}

function replaceAt<T>(list: readonly T[], index: number, value: T): T[] {
  const copy = list.slice();
  copy[index] = value;
  return copy;
}
