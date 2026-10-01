import type { TagName } from '../domain/types';

interface Tagged {
  readonly tags: readonly TagName[];
}

export function itemHasAnyTag(item: Tagged, active: ReadonlySet<TagName>): boolean {
  return item.tags.some((tag) => active.has(tag));
}

/** An item without tags is "uncategorized". */
export function isUncategorized(item: Tagged): boolean {
  return item.tags.length === 0;
}

/**
 * Decides if an item passes the tag filter. The active tags and the "Uncategorized" chip combine
 * with OR. When nothing is active, every item passes.
 */
export function passesTagFilter(
  item: Tagged,
  activeTags: ReadonlySet<TagName>,
  uncategorizedActive: boolean,
): boolean {
  if (activeTags.size === 0 && !uncategorizedActive) return true;
  return itemHasAnyTag(item, activeTags) || (uncategorizedActive && isUncategorized(item));
}
