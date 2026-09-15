// Branded primitives — constructed only through validated factories (src/domain/factories.ts).
export type ItemId = string & { readonly __brand: 'ItemId' };
export type Headline = string & { readonly __brand: 'Headline' };
export type Description = string & { readonly __brand: 'Description' };
export type IsoDate = string & { readonly __brand: 'IsoDate' };

export interface ItemBase {
  readonly id: ItemId;
  readonly headline: Headline;
  readonly createdAt: IsoDate;
}

export type ActiveItem = ItemBase & {
  readonly status: 'active';
  readonly description: Description | null;
};

export type CompleteItem = ItemBase & {
  readonly status: 'complete';
  readonly description: Description;
  readonly completedAt: IsoDate;
};

export type DiscardedItem = ItemBase & {
  readonly status: 'discarded';
  readonly description: Description | null;
  readonly discardedAt: IsoDate;
};

export type Item = ActiveItem | CompleteItem | DiscardedItem;

export type Section = 'new' | 'wip' | 'complete' | 'discarded';

export interface Board {
  readonly new: readonly ActiveItem[];
  readonly wip: readonly ActiveItem[];
  readonly complete: readonly CompleteItem[];
  readonly discarded: readonly DiscardedItem[];
}

export function sectionOf(item: Item): Section {
  switch (item.status) {
    case 'active':
      return item.description === null ? 'new' : 'wip';
    case 'complete':
      return 'complete';
    case 'discarded':
      return 'discarded';
  }
}

export function allItems(board: Board): readonly Item[] {
  return [...board.new, ...board.wip, ...board.complete, ...board.discarded];
}

export function findItemById(board: Board, id: ItemId): Item | undefined {
  return allItems(board).find((item) => item.id === id);
}
