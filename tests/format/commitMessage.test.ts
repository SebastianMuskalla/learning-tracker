import { describe, expect, it } from 'vitest';
import {
  generateItemId,
  makeHeadline,
  makeHexColor,
  makeIsoTimestamp,
  makeTagName,
} from '../../src/domain/factories';
import { unwrap } from '../../src/domain/result';
import type { ActiveItem } from '../../src/domain/types';
import { commitMessage, migrationMessage } from '../../src/format/commitMessage';

const CREATED = unwrap(makeIsoTimestamp('2026-09-01T00:00:00Z'));

const item: ActiveItem = {
  id: generateItemId(),
  headline: unwrap(makeHeadline('Learn Vue composables')),
  createdAt: CREATED,
  status: 'active',
  description: null,
  tags: [],
};

describe('commitMessage — tags', () => {
  it('createTag', () => {
    expect(
      commitMessage(
        { type: 'createTag', name: unwrap(makeTagName('vue')), color: unwrap(makeHexColor('#aacbee')) },
        undefined,
      ),
    ).toBe('Create tag "vue"');
  });

  it('setTagColor', () => {
    expect(
      commitMessage(
        { type: 'setTagColor', name: unwrap(makeTagName('vue')), color: unwrap(makeHexColor('#f6c9a4')) },
        undefined,
      ),
    ).toBe('Recolor tag "vue"');
  });

  it('deleteTag', () => {
    expect(commitMessage({ type: 'deleteTag', name: unwrap(makeTagName('vue')) }, undefined)).toBe(
      'Delete tag "vue"',
    );
  });

  it('tagItem', () => {
    expect(commitMessage({ type: 'tagItem', id: item.id, tag: unwrap(makeTagName('vue')) }, item)).toBe(
      'Tag "Learn Vue composables" with "vue"',
    );
  });

  it('untagItem', () => {
    expect(commitMessage({ type: 'untagItem', id: item.id, tag: unwrap(makeTagName('vue')) }, item)).toBe(
      'Untag "Learn Vue composables" from "vue"',
    );
  });
});

describe('migrationMessage', () => {
  it('names one step', () => {
    expect(migrationMessage(1, 2, [{ from: 1, description: 'replace the comment' }])).toBe(
      'Upgrade learning.md from format v1 to v2\n\nv1 → v2: replace the comment',
    );
  });

  it('lists every step of a chain in order', () => {
    expect(
      migrationMessage(0, 2, [
        { from: 0, description: 'create the board' },
        { from: 1, description: 'replace the comment' },
      ]),
    ).toBe(
      'Upgrade learning.md from format v0 to v2\n\nv0 → v1: create the board\nv1 → v2: replace the comment',
    );
  });
});
