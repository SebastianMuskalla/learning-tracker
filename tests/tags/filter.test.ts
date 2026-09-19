import { describe, expect, it } from 'vitest';
import { makeTagName } from '../../src/domain/factories';
import { unwrap } from '../../src/domain/result';
import type { TagName } from '../../src/domain/types';
import { itemHasAnyTag } from '../../src/tags/filter';

function tagName(text: string): TagName {
  return unwrap(makeTagName(text));
}

describe('itemHasAnyTag', () => {
  it('is false when the active set is empty', () => {
    expect(itemHasAnyTag({ tags: [tagName('vue')] }, new Set())).toBe(false);
  });

  it('is true when the item has one of the active tags', () => {
    expect(itemHasAnyTag({ tags: [tagName('vue'), tagName('rust')] }, new Set([tagName('rust')]))).toBe(true);
  });

  it('is false when there is no overlap', () => {
    expect(itemHasAnyTag({ tags: [tagName('vue')] }, new Set([tagName('rust')]))).toBe(false);
  });

  it('is false for an item with no tags', () => {
    expect(itemHasAnyTag({ tags: [] }, new Set([tagName('rust')]))).toBe(false);
  });
});
