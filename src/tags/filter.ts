import type { TagName } from '../domain/types';

export function itemHasAnyTag(
  item: { readonly tags: readonly TagName[] },
  active: ReadonlySet<TagName>,
): boolean {
  return item.tags.some((tag) => active.has(tag));
}
