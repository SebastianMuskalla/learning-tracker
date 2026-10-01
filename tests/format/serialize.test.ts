import { describe, expect, it } from 'vitest';
import { emptyBoard } from '../../src/domain/board';
import {
  generateItemId,
  makeDescription,
  makeHeadline,
  makeHexColor,
  makeIsoTimestamp,
  makeTagName,
} from '../../src/domain/factories';
import { unwrap } from '../../src/domain/result';
import type { ActiveItem, Board } from '../../src/domain/types';
import { fenceLength, HEADER_TITLE, serialize } from '../../src/format/serialize';
import { versionLine } from '../../src/format/version';

const HEADER = `${versionLine(4)}\n\n${HEADER_TITLE}`;

describe('serialize', () => {
  it('writes the header and all four section headings for an empty board', () => {
    const text = serialize(emptyBoard());
    expect(text.startsWith(`${HEADER}\n\n## New\n\n## WIP\n\n## Complete\n\n## Discarded\n`)).toBe(true);
  });

  it('starts the file with the version line, then the title', () => {
    expect(serialize(emptyBoard()).startsWith('<!-- version:4 -->\n\n# Learning\n\n')).toBe(true);
  });

  it('ends the file with a single trailing newline', () => {
    const text = serialize(emptyBoard());
    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
  });

  it('writes an item without a description as headline + metadata only', () => {
    const item: ActiveItem = {
      id: generateItemId(),
      headline: unwrap(makeHeadline('Kubernetes operators')),
      createdAt: unwrap(makeIsoTimestamp('2026-09-15T14:32:07Z')),
      status: 'active',
      description: null,
      tags: [],
    };
    const board: Board = { ...emptyBoard(), new: [item] };
    const text = serialize(board);
    expect(text).toContain(
      `### Kubernetes operators\n<!-- id:${item.id} created:2026-09-15T14:32:07Z -->\n\n`,
    );
  });

  it('writes the tag list between the metadata line and the fence', () => {
    const vue = unwrap(makeTagName('vue'));
    const item: ActiveItem = {
      id: generateItemId(),
      headline: unwrap(makeHeadline('Tagged')),
      createdAt: unwrap(makeIsoTimestamp('2026-09-15T14:32:07Z')),
      status: 'active',
      description: unwrap(makeDescription('text')),
      tags: [vue],
    };
    const board: Board = {
      ...emptyBoard(),
      tags: [{ name: vue, color: unwrap(makeHexColor('#aacbee')) }],
      wip: [item],
    };
    expect(serialize(board)).toContain(
      `<!-- id:${item.id} created:2026-09-15T14:32:07Z -->\n- vue\n\`\`\`markdown\ntext\n\`\`\`\n`,
    );
  });

  it('a board with no tags has no tag lines', () => {
    const text = serialize(emptyBoard());
    expect(text).not.toContain('tag:');
    expect(text).toBe(`${HEADER}\n\n## New\n\n## WIP\n\n## Complete\n\n## Discarded\n`);
  });

  it('writes tag definition lines directly after the header, then one blank line, then New', () => {
    const board: Board = {
      ...emptyBoard(),
      tags: [
        { name: unwrap(makeTagName('vue')), color: unwrap(makeHexColor('#aacbee')) },
        { name: unwrap(makeTagName('rust')), color: unwrap(makeHexColor('#f6c9a4')) },
      ],
    };
    const text = serialize(board);
    expect(text).toContain(
      `${HEADER}\n\n<!-- tag:vue color:#aacbee -->\n<!-- tag:rust color:#f6c9a4 -->\n\n## New`,
    );
  });

  it('an item with tags gets one `- NAME` line per tag, below the metadata; an item without tags gets none', () => {
    const vue = unwrap(makeTagName('vue'));
    const rust = unwrap(makeTagName('rust'));
    const color = unwrap(makeHexColor('#aacbee'));
    const tagged: ActiveItem = {
      id: generateItemId(),
      headline: unwrap(makeHeadline('Tagged')),
      createdAt: unwrap(makeIsoTimestamp('2026-09-15T14:32:07Z')),
      status: 'active',
      description: null,
      tags: [vue, rust],
    };
    const untagged: ActiveItem = {
      id: generateItemId(),
      headline: unwrap(makeHeadline('Untagged')),
      createdAt: unwrap(makeIsoTimestamp('2026-09-15T14:32:07Z')),
      status: 'active',
      description: null,
      tags: [],
    };
    const board: Board = {
      ...emptyBoard(),
      tags: [
        { name: vue, color },
        { name: rust, color },
      ],
      new: [tagged, untagged],
    };
    const text = serialize(board);
    expect(text).not.toContain('tags:');
    expect(text).toContain(`<!-- id:${tagged.id} created:2026-09-15T14:32:07Z -->\n- vue\n- rust\n\n`);
    expect(text).toContain(`<!-- id:${untagged.id} created:2026-09-15T14:32:07Z -->\n\n`);
  });
});

describe('fenceLength', () => {
  it.each([
    ['no backtick line', 'plain text', 3],
    ['a backtick run of 1 at the start', '`code` here', 3],
    ['a run of 3', '```ts\ncode\n```', 4],
    ['runs of 4 and 3', '````\n```', 5],
    ['3 spaces, then a run of 3', '   ```', 4],
    ['4 spaces, then a run of 3', '    ```', 3],
    ['a tab, then a run of 3', '\t```', 3],
    ['backticks later in a line', 'text ```````', 3],
  ])('is correct for %s', (_name, description, expected) => {
    expect(fenceLength(description)).toBe(expected);
  });
});
