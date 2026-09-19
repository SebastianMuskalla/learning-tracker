import { describe, expect, it } from 'vitest';
import { emptyBoard } from '../../src/domain/board';
import {
  generateItemId,
  makeHeadline,
  makeHexColor,
  makeIsoTimestamp,
  makeTagName,
} from '../../src/domain/factories';
import { unwrap } from '../../src/domain/result';
import type { ActiveItem, Board } from '../../src/domain/types';
import { HEADER_COMMENT, HEADER_TITLE, serialize } from '../../src/format/serialize';

describe('serialize', () => {
  it('writes the header and all four section headings for an empty board', () => {
    const text = serialize(emptyBoard());
    expect(
      text.startsWith(
        `${HEADER_TITLE}\n\n${HEADER_COMMENT}\n\n## New\n\n## WIP\n\n## Complete\n\n## Discarded\n`,
      ),
    ).toBe(true);
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

  it('a board with no tags serializes byte-for-byte as before (no new lines)', () => {
    const text = serialize(emptyBoard());
    expect(text).not.toContain('tag:');
    expect(text).toBe(
      `${HEADER_TITLE}\n\n${HEADER_COMMENT}\n\n## New\n\n## WIP\n\n## Complete\n\n## Discarded\n`,
    );
  });

  it('writes tag definition lines directly after the version comment, then one blank line, then New', () => {
    const board: Board = {
      ...emptyBoard(),
      tags: [
        { name: unwrap(makeTagName('vue')), color: unwrap(makeHexColor('#aacbee')) },
        { name: unwrap(makeTagName('rust')), color: unwrap(makeHexColor('#f6c9a4')) },
      ],
    };
    const text = serialize(board);
    expect(text).toContain(
      `${HEADER_COMMENT}\n\n<!-- tag:vue color:#aacbee -->\n<!-- tag:rust color:#f6c9a4 -->\n\n## New`,
    );
  });

  it('an item with tags gets a tags: part in definition order; an item without tags gets none', () => {
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
    expect(text).toContain(`<!-- id:${tagged.id} created:2026-09-15T14:32:07Z tags:vue,rust -->`);
    expect(text).toContain(`<!-- id:${untagged.id} created:2026-09-15T14:32:07Z -->\n`);
  });
});
