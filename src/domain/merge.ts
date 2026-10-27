// Three-way merge of two boards that both descend from a common `base`. Used to reconcile a
// local write that lost a race against a remote change, instead of always asking the user to
// throw one side away (see "Retry without a real conflict" in openspec/specs/sync/spec.md).
import { itemsEqual, validateBoard } from './board';
import { err, ok, type Result } from './result';
import { allItems, type Board, type Item, type ItemId, type Status, type Tag, type TagName } from './types';

export type MergeConflict =
  | { readonly type: 'DivergentEdit'; readonly id: ItemId }
  | { readonly type: 'DivergentTagEdit'; readonly name: TagName };

/** The side whose version each conflicting item and tag takes, after the user chose one. */
export type MergeSide = 'local' | 'remote';

export interface MergeResult {
  readonly board: Board;
  /** The number of local edits that were lost, because the remote side deleted the item or tag. */
  readonly droppedLocalChanges: number;
  /** The sections whose local reorder was lost, because the remote side reordered them differently. */
  readonly lostLocalReorders: ReadonlySet<Status>;
}

/**
 * Merges `local` and `remote`, both derived from `base`, item by item:
 *  - an item added on only one side is kept;
 *  - an item deleted on either side (relative to `base`) is dropped — delete wins;
 *  - an item changed on only one side takes that side's value;
 *  - an item changed identically on both sides is kept once;
 *  - an item changed differently on both sides is a real conflict — the merge fails and returns
 *    every conflict.
 * The order of a section follows `local` if only `local` reordered the section, and `remote` in
 * every other case (see `orderSection`).
 */
export function merge(
  base: Board,
  local: Board,
  remote: Board,
): Result<MergeResult, readonly MergeConflict[]> {
  return mergeWith(base, local, remote, undefined);
}

/** Like `merge`, but each conflicting item and tag takes the version of `side`, so it never fails. */
export function mergeChoosing(base: Board, local: Board, remote: Board, side: MergeSide): MergeResult {
  const merged = mergeWith(base, local, remote, side);
  if (!merged.ok)
    throw new Error(`merge with a chosen side still conflicts: ${JSON.stringify(merged.error)}`);
  return merged.value;
}

function mergeWith(
  base: Board,
  local: Board,
  remote: Board,
  side: MergeSide | undefined,
): Result<MergeResult, readonly MergeConflict[]> {
  const mergedTags = mergeTags(base.tags, local.tags, remote.tags, side);
  const merged = mergeItems(base, local, remote, side);
  const conflicts = [...mergedTags.conflicts, ...merged.conflicts];
  if (conflicts.length > 0) return err(conflicts);

  // A tag deleted on either side (relative to base) drops out of mergedTags above; strip it from
  // any item that still names it, so "deleted here, item tagged with it there" never conflicts.
  const mergedTagNames = new Set(mergedTags.values.map((tag) => tag.name));
  const strippedItems = merged.values.map((item) =>
    item.tags.every((name) => mergedTagNames.has(name))
      ? item
      : { ...item, tags: item.tags.filter((name) => mergedTagNames.has(name)) },
  );

  const newItems: Item[] = [];
  const completeItems: Item[] = [];
  const discardedItems: Item[] = [];
  for (const item of strippedItems) {
    switch (item.status) {
      case 'new':
        newItems.push(item);
        break;
      case 'complete':
        completeItems.push(item);
        break;
      case 'discarded':
        discardedItems.push(item);
        break;
    }
  }

  const lostLocalReorders = new Set<Status>();
  const ordered = (section: Status, items: readonly Item[]): Item[] => {
    const result = orderSection(section, items, base, local, remote);
    if (result.localReorderLost) lostLocalReorders.add(section);
    return result.items;
  };

  const board: Board = {
    tags: orderTags(mergedTags.values, remote, local),
    new: ordered('new', newItems).filter(isNew),
    complete: ordered('complete', completeItems).filter(isComplete),
    discarded: ordered('discarded', discardedItems).filter(isDiscarded),
  };

  // The sort by status and the per-item resolution above already guarantee a structurally valid
  // board; this is a defensive backstop, not an expected path.
  const validated = validateBoard(board);
  if (!validated.ok) {
    throw new Error(`merge produced an invalid board: ${JSON.stringify(validated.error)}`);
  }

  return ok({
    board,
    droppedLocalChanges: mergedTags.droppedLocal + merged.droppedLocal,
    lostLocalReorders,
  });
}

/** The merged values of one kind (items or tags), with the conflicts and the lost local edits. */
interface PartMerge<T> {
  readonly values: readonly T[];
  readonly conflicts: readonly MergeConflict[];
  readonly droppedLocal: number;
}

/** The merged value of one item or tag. `null` means that the item or tag is gone. */
interface Resolution<T> {
  readonly value: T | null;
  /** True when a local edit was lost, because the remote side deleted the item or tag. */
  readonly droppedLocal: boolean;
}

function kept<T>(value: T | null): Result<Resolution<T>, MergeConflict> {
  return ok({ value, droppedLocal: false });
}

/** Two different versions of one item or tag: a conflict, unless the user chose a side. */
function choose<T>(
  side: MergeSide | undefined,
  local: T,
  remote: T,
  conflict: MergeConflict,
): Result<Resolution<T>, MergeConflict> {
  if (side === undefined) return err(conflict);
  return kept(side === 'local' ? local : remote);
}

function isNew(item: Item): item is Extract<Item, { status: 'new' }> {
  return item.status === 'new';
}

function isComplete(item: Item): item is Extract<Item, { status: 'complete' }> {
  return item.status === 'complete';
}

function isDiscarded(item: Item): item is Extract<Item, { status: 'discarded' }> {
  return item.status === 'discarded';
}

function mergeItems(base: Board, local: Board, remote: Board, side: MergeSide | undefined): PartMerge<Item> {
  const baseItems = itemMap(base);
  const localItems = itemMap(local);
  const remoteItems = itemMap(remote);

  const allIds = new Set<ItemId>([...baseItems.keys(), ...localItems.keys(), ...remoteItems.keys()]);

  const merged: Item[] = [];
  const conflicts: MergeConflict[] = [];
  let droppedLocal = 0;
  for (const id of allIds) {
    const resolved = resolveItem(id, baseItems.get(id), localItems.get(id), remoteItems.get(id), side);
    if (!resolved.ok) {
      conflicts.push(resolved.error);
      continue;
    }
    if (resolved.value.droppedLocal) droppedLocal += 1;
    if (resolved.value.value !== null) merged.push(resolved.value.value);
  }
  return { values: merged, conflicts, droppedLocal };
}

function resolveItem(
  id: ItemId,
  base: Item | undefined,
  local: Item | undefined,
  remote: Item | undefined,
  side: MergeSide | undefined,
): Result<Resolution<Item>, MergeConflict> {
  if (base === undefined) {
    // Not in the common ancestor: an add on one or both sides.
    if (local !== undefined && remote !== undefined) {
      return itemsEqual(local, remote)
        ? kept(local)
        : choose(side, local, remote, { type: 'DivergentEdit', id });
    }
    return kept(local ?? remote ?? null);
  }

  // In the common ancestor: a delete on either side wins, regardless of edits on the other side.
  // A local edit of an item that the remote side deleted is lost; the caller tells the user.
  if (local === undefined || remote === undefined) {
    return ok({ value: null, droppedLocal: local !== undefined && !itemsEqual(base, local) });
  }

  const localChanged = !itemsEqual(base, local);
  const remoteChanged = !itemsEqual(base, remote);
  if (!localChanged && !remoteChanged) return kept(base);
  if (localChanged && !remoteChanged) return kept(local);
  if (!localChanged && remoteChanged) return kept(remote);
  return itemsEqual(local, remote) ? kept(local) : choose(side, local, remote, { type: 'DivergentEdit', id });
}

function itemMap(board: Board): Map<ItemId, Item> {
  return new Map(allItems(board).map((item) => [item.id, item]));
}

function mergeTags(
  base: readonly Tag[],
  local: readonly Tag[],
  remote: readonly Tag[],
  side: MergeSide | undefined,
): PartMerge<Tag> {
  const baseTags = tagMap(base);
  const localTags = tagMap(local);
  const remoteTags = tagMap(remote);
  const allNames = new Set<TagName>([...baseTags.keys(), ...localTags.keys(), ...remoteTags.keys()]);

  const merged: Tag[] = [];
  const conflicts: MergeConflict[] = [];
  let droppedLocal = 0;
  for (const name of allNames) {
    const resolved = resolveTag(name, baseTags.get(name), localTags.get(name), remoteTags.get(name), side);
    if (!resolved.ok) {
      conflicts.push(resolved.error);
      continue;
    }
    if (resolved.value.droppedLocal) droppedLocal += 1;
    const tag = resolved.value.value;
    if (tag === null) continue;
    // Tag names are unique regardless of case. The two sides created the same tag with a
    // different case (for example "vue" here and "Vue" on GitHub): the user has to choose.
    const lower = tag.name.toLowerCase();
    const sameName = merged.findIndex((other) => other.name.toLowerCase() === lower);
    if (sameName === -1) {
      merged.push(tag);
    } else if (side === undefined) {
      conflicts.push({ type: 'DivergentTagEdit', name: tag.name });
    } else if ((side === 'local' ? localTags : remoteTags).has(tag.name)) {
      merged[sameName] = tag;
    }
  }
  return { values: merged, conflicts, droppedLocal };
}

function resolveTag(
  name: TagName,
  base: Tag | undefined,
  local: Tag | undefined,
  remote: Tag | undefined,
  side: MergeSide | undefined,
): Result<Resolution<Tag>, MergeConflict> {
  if (base === undefined) {
    // Not in the common ancestor: a create on one or both sides.
    if (local !== undefined && remote !== undefined) {
      return local.color === remote.color
        ? kept(local)
        : choose(side, local, remote, { type: 'DivergentTagEdit', name });
    }
    return kept(local ?? remote ?? null);
  }

  // In the common ancestor: a delete on either side wins, regardless of a recolor on the other.
  // A local recolor of a tag that the remote side deleted is lost; the caller tells the user.
  if (local === undefined || remote === undefined) {
    return ok({ value: null, droppedLocal: local !== undefined && local.color !== base.color });
  }

  const localChanged = local.color !== base.color;
  const remoteChanged = remote.color !== base.color;
  if (!localChanged && !remoteChanged) return kept(base);
  if (localChanged && !remoteChanged) return kept(local);
  if (!localChanged && remoteChanged) return kept(remote);
  return local.color === remote.color
    ? kept(local)
    : choose(side, local, remote, { type: 'DivergentTagEdit', name });
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

function sectionIds(board: Board, section: Status): readonly ItemId[] {
  return board[section].map((item) => item.id);
}

/** True if the items that `a` and `b` share are in a different order in `a` than in `b`. */
function orderDiffers(a: readonly ItemId[], b: readonly ItemId[]): boolean {
  const inA = new Set(a);
  const inB = new Set(b);
  const sharedB = b.filter((id) => inA.has(id));
  return a.filter((id) => inB.has(id)).some((id, index) => id !== sharedB[index]);
}

function itemOf(byId: ReadonlyMap<ItemId, Item>, id: ItemId): Item {
  const value = byId.get(id);
  if (value === undefined) throw new Error(`merge: missing item for id ${id}`);
  return value;
}

interface SectionOrder {
  readonly items: Item[];
  /** True when both sides reordered the section differently, so the local reorder is lost. */
  readonly localReorderLost: boolean;
}

/**
 * Orders the merged items of one section. A side "reordered" the section when the items it shares
 * with `base` are in another order there. The leading side is `local` if only `local` reordered the
 * section, and `remote` otherwise. Its items keep its order. Each other item (added on the other
 * side, or moved into this section there) is spliced in right after its nearest predecessor on the
 * other side that made it into the result, or at the front. So an item that a status change moved
 * to the top of a section stays at the top.
 */
function orderSection(
  section: Status,
  items: readonly Item[],
  base: Board,
  local: Board,
  remote: Board,
): SectionOrder {
  const baseIds = sectionIds(base, section);
  const localIds = sectionIds(local, section);
  const remoteIds = sectionIds(remote, section);
  const localReordered = orderDiffers(baseIds, localIds);
  const remoteReordered = orderDiffers(baseIds, remoteIds);
  const [leadIds, otherIds] =
    localReordered && !remoteReordered ? [localIds, remoteIds] : [remoteIds, localIds];

  const byId = new Map(items.map((item) => [item.id, item]));
  const resultIds: ItemId[] = leadIds.filter((id) => byId.has(id));
  const placed = new Set(resultIds);

  otherIds.forEach((id, index) => {
    if (!byId.has(id) || placed.has(id)) return;
    let insertAt = 0;
    for (let i = index - 1; i >= 0; i -= 1) {
      const candidateId = otherIds[i];
      const idx = candidateId === undefined ? -1 : resultIds.indexOf(candidateId);
      if (idx !== -1) {
        insertAt = idx + 1;
        break;
      }
    }
    resultIds.splice(insertAt, 0, id);
    placed.add(id);
  });

  // Each merged item is the local or the remote version, so it is in this section on one side.
  if (resultIds.length !== items.length) throw new Error(`merge: unplaced items in section ${section}`);

  return {
    items: resultIds.map((id) => itemOf(byId, id)),
    localReorderLost: localReordered && remoteReordered && orderDiffers(localIds, remoteIds),
  };
}
