import { describe, expect, it } from 'vitest';
import {
  generateItemId,
  makeHeadline,
  makeHexColor,
  makeIsoTimestamp,
  makeTagName,
} from '../../src/domain/factories';
import { unwrap } from '../../src/domain/result';
import type { Command } from '../../src/domain/commands';
import type { NewItem } from '../../src/domain/types';
import { combineMessages, commitMessage, migrationMessage } from '../../src/format/commitMessage';
import { upgrade } from '../../src/format/migrations/run';
import { CURRENT_VERSION } from '../../src/format/version';

const CREATED = unwrap(makeIsoTimestamp('2026-09-01T00:00:00Z'));

const item: NewItem = {
  id: generateItemId(),
  headline: unwrap(makeHeadline('Learn Vue composables')),
  createdAt: CREATED,
  status: 'new',
  description: null,
  tags: [],
};

describe('commitMessage — items', () => {
  it.each<[Command, string]>([
    [{ type: 'add', headline: unwrap(makeHeadline('Docker')) }, 'Add "Docker"'],
    [
      { type: 'editHeadline', id: item.id, headline: unwrap(makeHeadline('Nuxt')) },
      'Rename "Learn Vue composables" → "Nuxt"',
    ],
    [{ type: 'setDescription', id: item.id, description: null }, 'Describe "Learn Vue composables"'],
    [{ type: 'complete', id: item.id }, 'Complete "Learn Vue composables"'],
    [{ type: 'uncomplete', id: item.id }, 'Reopen "Learn Vue composables"'],
    [{ type: 'discard', id: item.id }, 'Discard "Learn Vue composables"'],
    [{ type: 'restore', id: item.id }, 'Restore "Learn Vue composables"'],
    [{ type: 'delete', id: item.id }, 'Delete "Learn Vue composables"'],
    [{ type: 'reorder', section: 'new', fromIndex: 0, toIndex: 1 }, 'Reorder New'],
  ])('%j', (command, expected) => {
    expect(commitMessage(command, item)).toBe(expected);
  });
});

describe('combineMessages', () => {
  it('keeps the message of a batch of 1', () => {
    expect(combineMessages(['Complete "Docker"'])).toBe('Complete "Docker"');
  });

  it('writes a subject and one body line per change for a batch of 2', () => {
    expect(combineMessages(['Add "A"', 'Complete "B"'])).toBe(
      'Update learning.md (2 changes)\n\n- Add "A"\n- Complete "B"',
    );
  });
});

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

describe('migrationMessage for an upgrade from version 4', () => {
  // Scenario "Body lines" of the requirement "Upgrade commit".
  it('has one body line for each step', () => {
    const result = upgrade(
      '<!-- version:4 -->\n\n# Learning\n\n## New\n\n## WIP\n\n## Complete\n\n## Discarded\n',
    );
    if (!result.ok || result.value.kind !== 'migrated') throw new Error('expected a migration');
    expect(migrationMessage(result.value.from, CURRENT_VERSION, result.value.steps)).toBe(
      'Upgrade learning.md from format v4 to v6\n\n' +
        'v4 → v5: remove the tag "Uncategorized", which is now a reserved name\n' +
        'v5 → v6: merge the WIP section into the New section',
    );
  });
});
