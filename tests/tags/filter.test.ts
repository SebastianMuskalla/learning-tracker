import { describe, expect, it } from 'vitest';
import { makeTagName } from '../../src/domain/factories';
import { unwrap } from '../../src/domain/result';
import type { TagName } from '../../src/domain/types';
import { isUncategorized, itemHasAnyTag, passesTagFilter } from '../../src/tags/filter';

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

describe('isUncategorized', () => {
  it('is true only for an item without tags', () => {
    expect(isUncategorized({ tags: [] })).toBe(true);
    expect(isUncategorized({ tags: [tagName('vue')] })).toBe(false);
  });
});

describe('passesTagFilter', () => {
  const vue = tagName('vue');
  const rust = tagName('rust');

  it('passes every item when nothing is active', () => {
    expect(passesTagFilter({ tags: [] }, new Set(), false)).toBe(true);
    expect(passesTagFilter({ tags: [vue] }, new Set(), false)).toBe(true);
  });

  it('with only the chip, passes only items without tags', () => {
    expect(passesTagFilter({ tags: [] }, new Set(), true)).toBe(true);
    expect(passesTagFilter({ tags: [vue] }, new Set(), true)).toBe(false);
  });

  it('with only tags, passes items that have an active tag', () => {
    expect(passesTagFilter({ tags: [vue] }, new Set([vue]), false)).toBe(true);
    expect(passesTagFilter({ tags: [rust] }, new Set([vue]), false)).toBe(false);
    expect(passesTagFilter({ tags: [] }, new Set([vue]), false)).toBe(false);
  });

  it('combines tags and the chip with OR', () => {
    const active = new Set([vue]);
    expect(passesTagFilter({ tags: [] }, active, true)).toBe(true);
    expect(passesTagFilter({ tags: [vue] }, active, true)).toBe(true);
    expect(passesTagFilter({ tags: [rust] }, active, true)).toBe(false);
  });
});
