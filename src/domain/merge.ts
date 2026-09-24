// Three-way merge of two boards that both descend from a common `base`. Used to reconcile a
// local write that lost a race against a remote change, instead of always asking the user to
// throw one side away (see doc/requirement-1-concurrency.md, phase 3).
import { itemsEqual, validateBoard } from './board';
import { err, ok, type Result } from './result';
import {
  allItems,
  sectionOf,
  type Board,
  type Item,
  type ItemId,
  type Section,
  type Tag,
  type TagName,
} from './types';

export type MergeConflict =
  | { readonly type: 'DivergentEdit'; readonly id: ItemId }
  | { readonly type: 'DivergentTagEdit'; readonly name: TagName };

const SECTION_ORDER: readonly Section[] = ['new', 'wip', 'complete', 'discarded'];

/**
 * Merges `local` and `remote`, both derived from `base`, item by item:
 *  - an item added on only one side is kept;
 *  - an item deleted on either side (relative to `base`) is dropped — delete wins;
 *  - an item changed on only one side takes that side's value;
 *  - an item changed identically on both sides is kept once;
 *  - an item changed differently on both sides is a real conflict — the whole merge fails.
 * Ordering follows `remote`, with local-only additions inserted at their local position.
 */
export function merge(base: Board, local: Board, remote: Board): Result<Board, MergeConflict> {
  const mergedTags = mergeTags(base.tags, local.tags, remote.tags);
  if (!mergedTags.ok) return mergedTags;

  const merged = mergeItems(base, local, remote);
  if (!merged.ok) return merged;

  // A tag deleted on either side (relative to base) drops out of mergedTags above; strip it from
  // any item that still names it, so "deleted here, item tagged with it there" never conflicts.
  const mergedTagNames = new Set(mergedTags.value.map((tag) => tag.name));
  const strippedItems = merged.value.map((item) =>
    item.tags.every((name) => mergedTagNames.has(name))
      ? item
      : { ...item, tags: item.tags.filter((name) => mergedTagNames.has(name)) },
  );

  const newItems: Item[] = [];
  const wipItems: Item[] = [];
  const completeItems: Item[] = [];
  const discardedItems: Item[] = [];
  for (const item of strippedItems) {
    switch (sectionOf(item)) {
      case 'new':
        newItems.push(item);
        break;
      case 'wip':
        wipItems.push(item);
        break;
      case 'complete':
        completeItems.push(item);
        break;
      case 'discarded':
        discardedItems.push(item);
        break;
    }
  }

  const board: Board = {
    tags: orderTags(mergedTags.value, remote, local),
    new: orderSection(newItems, remote, local).filter(isActive),
    wip: orderSection(wipItems, remote, local).filter(isActive),
    complete: orderSection(completeItems, remote, local).filter(isComplete),
    discarded: orderSection(discardedItems, remote, local).filter(isDiscarded),
  };

  // sectionOf() and the per-item resolution above already guarantee a structurally valid
  // board; this is a defensive backstop, not an expected path.
  const validated = validateBoard(board);
  if (!validated.ok) {
    throw new Error(`merge produced an invalid board: ${JSON.stringify(validated.error)}`);
  }

  return ok(board);
}

function isActive(item: Item): item is Extract<Item, { status: 'active' }> {
  return item.status === 'active';
}

function isComplete(item: Item): item is Extract<Item, { status: 'complete' }> {
  return item.status === 'complete';
}

function isDiscarded(item: Item): item is Extract<Item, { status: 'discarded' }> {
  return item.status === 'discarded';
}

function mergeItems(base: Board, local: Board, remote: Board): Result<readonly Item[], MergeConflict> {
  const baseItems = itemMap(base);
  const localItems = itemMap(local);
  const remoteItems = itemMap(remote);

  const allIds = new Set<ItemId>([...baseItems.keys(), ...localItems.keys(), ...remoteItems.keys()]);

  const merged: Item[] = [];
  for (const id of allIds) {
    const resolved = resolveItem(id, baseItems.get(id), localItems.get(id), remoteItems.get(id));
    if (!resolved.ok) return resolved;
    if (resolved.value !== null) merged.push(resolved.value);
  }
  return ok(merged);
}

function resolveItem(
  id: ItemId,
  base: Item | undefined,
  local: Item | undefined,
  remote: Item | undefined,
): Result<Item | null, MergeConflict> {
  if (base === undefined) {
    // Not in the common ancestor: an add on one or both sides.
    if (local !== undefined && remote !== undefined) {
      return itemsEqual(local, remote) ? ok(local) : err({ type: 'DivergentEdit', id });
    }
    return ok(local ?? remote ?? null);
  }

  // In the common ancestor: a delete on either side wins, regardless of edits on the other side.
  if (local === undefined || remote === undefined) return ok(null);

  const localChanged = !itemsEqual(base, local);
  const remoteChanged = !itemsEqual(base, remote);
  if (!localChanged && !remoteChanged) return ok(base);
  if (localChanged && !remoteChanged) return ok(local);
  if (!localChanged && remoteChanged) return ok(remote);
  return itemsEqual(local, remote) ? ok(local) : err({ type: 'DivergentEdit', id });
}

function itemMap(board: Board): Map<ItemId, Item> {
  return new Map(allItems(board).map((item) => [item.id, item]));
}

function mergeTags(
  base: readonly Tag[],
  local: readonly Tag[],
  remote: readonly Tag[],
): Result<readonly Tag[], MergeConflict> {
  const baseTags = tagMap(base);
  const localTags = tagMap(local);
  const remoteTags = tagMap(remote);
  const allNames = new Set<TagName>([...baseTags.keys(), ...localTags.keys(), ...remoteTags.keys()]);

  const merged: Tag[] = [];
  const mergedLower = new Set<string>();
  for (const name of allNames) {
    const resolved = resolveTag(name, baseTags.get(name), localTags.get(name), remoteTags.get(name));
    if (!resolved.ok) return resolved;
    if (resolved.value === null) continue;
    // Tag names are unique regardless of case. The two sides created the same tag with a
    // different case (for example "vue" here and "Vue" on GitHub): the user has to choose.
    const lower = resolved.value.name.toLowerCase();
    if (mergedLower.has(lower)) return err({ type: 'DivergentTagEdit', name: resolved.value.name });
    mergedLower.add(lower);
    merged.push(resolved.value);
  }
  return ok(merged);
}

function resolveTag(
  name: TagName,
  base: Tag | undefined,
  local: Tag | undefined,
  remote: Tag | undefined,
): Result<Tag | null, MergeConflict> {
  if (base === undefined) {
    // Not in the common ancestor: a create on one or both sides.
    if (local !== undefined && remote !== undefined) {
      return local.color === remote.color ? ok(local) : err({ type: 'DivergentTagEdit', name });
    }
    return ok(local ?? remote ?? null);
  }

  // In the common ancestor: a delete on either side wins, regardless of a recolor on the other.
  if (local === undefined || remote === undefined) return ok(null);

  const localChanged = local.color !== base.color;
  const remoteChanged = remote.color !== base.color;
  if (!localChanged && !remoteChanged) return ok(base);
  if (localChanged && !remoteChanged) return ok(local);
  if (!localChanged && remoteChanged) return ok(remote);
  return local.color === remote.color ? ok(local) : err({ type: 'DivergentTagEdit', name });
}

function tagMap(tags: readonly Tag[]): Map<TagName, Tag> {
  return new Map(tags.map((tag) => [tag.name, tag]));
}

/** Orders the merged tag list following `remote`, with local-only additions spliced in right
 *  after their nearest local predecessor that made it into the result — the same approach as
 *  `orderSection`, but keyed by tag name instead of item id. */
function orderTags(tags: readonly Tag[], remote: Board, local: Board): Tag[] {
  const remoteOrder = remote.tags.map((tag) => tag.name);
  const localOrder = local.tags.map((tag) => tag.name);
  const remoteRank = new Map(remoteOrder.map((name, index) => [name, index]));
  const localRank = new Map(localOrder.map((name, index) => [name, index]));
  const byName = new Map(tags.map((tag) => [tag.name, tag]));

  const inRemote = tags
    .filter((tag) => remoteRank.has(tag.name))
    .sort((a, b) => (remoteRank.get(a.name) ?? 0) - (remoteRank.get(b.name) ?? 0));
  const localOnly = tags
    .filter((tag) => !remoteRank.has(tag.name))
    .sort((a, b) => (localRank.get(a.name) ?? 0) - (localRank.get(b.name) ?? 0));

  const resultNames: TagName[] = inRemote.map((tag) => tag.name);

  for (const tag of localOnly) {
    const myLocalRank = localRank.get(tag.name) ?? 0;
    let insertAt = 0;
    for (let i = myLocalRank - 1; i >= 0; i -= 1) {
      const candidateName = localOrder[i];
      if (candidateName === undefined) continue;
      const idx = resultNames.indexOf(candidateName);
      if (idx !== -1) {
        insertAt = idx + 1;
        break;
      }
    }
    resultNames.splice(insertAt, 0, tag.name);
  }

  return resultNames.map((name) => {
    const tag = byName.get(name);
    if (tag === undefined) throw new Error(`merge: missing tag for name ${name}`);
    return tag;
  });
}

function concatenatedOrder(board: Board): readonly ItemId[] {
  return SECTION_ORDER.flatMap((section) => board[section].map((item) => item.id));
}

function rankOf(rank: ReadonlyMap<ItemId, number>, id: ItemId): number {
  const value = rank.get(id);
  if (value === undefined) throw new Error(`merge: missing order rank for item ${id}`);
  return value;
}

function itemOf(byId: ReadonlyMap<ItemId, Item>, id: ItemId): Item {
  const value = byId.get(id);
  if (value === undefined) throw new Error(`merge: missing item for id ${id}`);
  return value;
}

/**
 * Orders one target section's merged items: items that already existed in `remote` keep
 * remote's relative order; items that are new to `local` are spliced in right after their
 * nearest local predecessor that made it into the result (or at the front, if none did).
 */
function orderSection(items: readonly Item[], remote: Board, local: Board): Item[] {
  const remoteOrder = concatenatedOrder(remote);
  const localOrder = concatenatedOrder(local);
  const remoteRank = new Map(remoteOrder.map((id, index) => [id, index]));
  const localRank = new Map(localOrder.map((id, index) => [id, index]));
  const byId = new Map(items.map((item) => [item.id, item]));

  const inRemote = items
    .filter((item) => remoteRank.has(item.id))
    .sort((a, b) => rankOf(remoteRank, a.id) - rankOf(remoteRank, b.id));
  const localOnly = items
    .filter((item) => !remoteRank.has(item.id))
    .sort((a, b) => (localRank.get(a.id) ?? 0) - (localRank.get(b.id) ?? 0));

  const resultIds: ItemId[] = inRemote.map((item) => item.id);

  for (const item of localOnly) {
    const myLocalRank = localRank.get(item.id) ?? 0;
    let insertAt = 0;
    for (let i = myLocalRank - 1; i >= 0; i -= 1) {
      const candidateId = localOrder[i];
      if (candidateId === undefined) continue;
      const idx = resultIds.indexOf(candidateId);
      if (idx !== -1) {
        insertAt = idx + 1;
        break;
      }
    }
    resultIds.splice(insertAt, 0, item.id);
  }

  return resultIds.map((id) => itemOf(byId, id));
}
