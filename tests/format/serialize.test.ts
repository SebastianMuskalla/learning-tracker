import { describe, expect, it } from 'vitest';
import { emptyBoard } from '../../src/domain/board';
import { generateItemId, makeHeadline, makeIsoTimestamp } from '../../src/domain/factories';
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
    };
    const board: Board = { ...emptyBoard(), new: [item] };
    const text = serialize(board);
    expect(text).toContain(
      `### Kubernetes operators\n<!-- id:${item.id} created:2026-09-15T14:32:07Z -->\n\n`,
    );
  });
});
