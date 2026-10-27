// Branded primitives — constructed only through validated factories (src/domain/factories.ts).
export type ItemId = string & { readonly __brand: 'ItemId' };
export type Headline = string & { readonly __brand: 'Headline' };
export type Description = string & { readonly __brand: 'Description' };
export type TagName = string & { readonly __brand: 'TagName' };
export type HexColor = string & { readonly __brand: 'HexColor' };
/** A full UTC timestamp, for example `2026-09-16T14:32:07Z`. See `makeIsoTimestamp` in factories.ts. */
export type IsoTimestamp = string & { readonly __brand: 'IsoTimestamp' };

export interface Tag {
  readonly name: TagName;
  readonly color: HexColor;
}

export interface ItemBase {
  readonly id: ItemId;
  readonly headline: Headline;
  readonly createdAt: IsoTimestamp;
  /** In definition order. `[]` for an item with no tags, including every item written before
   *  tags existed. */
  readonly tags: readonly TagName[];
}

export type NewItem = ItemBase & {
  readonly status: 'new';
  readonly description: Description | null;
};

export type CompleteItem = ItemBase & {
  readonly status: 'complete';
  readonly description: Description;
  readonly completedAt: IsoTimestamp;
};

export type DiscardedItem = ItemBase & {
  readonly status: 'discarded';
  readonly description: Description | null;
  readonly discardedAt: IsoTimestamp;
};

export type Item = NewItem | CompleteItem | DiscardedItem;

/** The status of an item. The board has one section for each status. */
export type Status = Item['status'];

export interface Board {
  /** Tag definitions, in display order (the order a new tag is appended in). */
  readonly tags: readonly Tag[];
  readonly new: readonly NewItem[];
  readonly complete: readonly CompleteItem[];
  readonly discarded: readonly DiscardedItem[];
}

export function allItems(board: Board): readonly Item[] {
  return [...board.new, ...board.complete, ...board.discarded];
}

export function findItemById(board: Board, id: ItemId): Item | undefined {
  return allItems(board).find((item) => item.id === id);
}
