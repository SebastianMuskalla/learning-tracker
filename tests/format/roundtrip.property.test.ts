import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { boardsEqual } from '../../src/domain/board';
import {
  generateItemId,
  makeHeadline,
  makeIsoTimestamp,
  makeOptionalDescription,
} from '../../src/domain/factories';
import { unwrap } from '../../src/domain/result';
import type {
  ActiveItem,
  Board,
  CompleteItem,
  Description,
  DiscardedItem,
  Headline,
  IsoTimestamp,
} from '../../src/domain/types';
import { parse } from '../../src/format/parse';
import { serialize } from '../../src/format/serialize';

// A mix of full timestamps and legacy date-only values, to exercise both formats.
const TIMESTAMPS: readonly IsoTimestamp[] = [
  '2024-02-29',
  '2025-01-01T00:00:00Z',
  '2025-12-31T23:59:59Z',
  '2026-09-15',
  '2026-06-30T08:15:42Z',
].map((d) => unwrap(makeIsoTimestamp(d)));

const arbitraryDate: fc.Arbitrary<IsoTimestamp> = fc.constantFrom(...TIMESTAMPS);

const arbitraryHeadline: fc.Arbitrary<Headline> = fc
  .string({ minLength: 1, maxLength: 40 })
  .map((s) => s.replace(/\n/g, ' ').split('<!--').join(''))
  .filter((s) => s.trim().length > 0)
  .map((s) => unwrap(makeHeadline(s)));

// Building blocks designed to defeat a naive parser: heading markers at every level, fenced code
// containing the start marker, comment-shaped lines, blank lines, tabs, unicode, CRLF fragments.
const evilLine: fc.Arbitrary<string> = fc.oneof(
  fc.constant('# Not a header'),
  fc.constant('## Not a section'),
  fc.constant('### Not an item'),
  fc.constant('<!-- id:00000000000000000000000000 created:1999-01-01 -->'),
  fc.constant('<!-- desc -->'),
  fc.constant('```ts\nconst x: number = 1;\n```'),
  fc.constant(''),
  fc.constant('\t\ttab-indented'),
  fc.constant('trailing whitespace   '),
  fc.constant('café, 日本語, emoji 🎉, — em dash'),
  fc.constant('line one\r\nline two'),
  fc.string({ maxLength: 30 }),
);

const arbitraryDescriptionText: fc.Arbitrary<string> = fc
  .array(evilLine, { minLength: 0, maxLength: 8 })
  .map((lines) => lines.join('\n'))
  .filter((text) => !text.includes('<!-- /desc -->'));

const arbitraryNonEmptyDescription: fc.Arbitrary<Description> = arbitraryDescriptionText
  .map((text) => unwrap(makeOptionalDescription(text.trim().length === 0 ? `x\n${text}` : text)))
  .filter((value): value is Description => value !== null);

const arbitraryOptionalDescription: fc.Arbitrary<Description | null> = arbitraryDescriptionText.map((text) =>
  unwrap(makeOptionalDescription(text)),
);

function arbitraryActiveItem(description: fc.Arbitrary<Description | null>): fc.Arbitrary<ActiveItem> {
  return fc.tuple(arbitraryHeadline, arbitraryDate, description).map(([headline, createdAt, desc]) => ({
    id: generateItemId(),
    headline,
    createdAt,
    status: 'active' as const,
    description: desc,
  }));
}

const arbitraryCompleteItem: fc.Arbitrary<CompleteItem> = fc
  .tuple(arbitraryHeadline, arbitraryDate, arbitraryDate, arbitraryNonEmptyDescription)
  .map(([headline, createdAt, completedAt, description]) => ({
    id: generateItemId(),
    headline,
    createdAt,
    status: 'complete' as const,
    description,
    completedAt,
  }));

const arbitraryDiscardedItem: fc.Arbitrary<DiscardedItem> = fc
  .tuple(arbitraryHeadline, arbitraryDate, arbitraryDate, arbitraryOptionalDescription)
  .map(([headline, createdAt, discardedAt, description]) => ({
    id: generateItemId(),
    headline,
    createdAt,
    status: 'discarded' as const,
    description,
    discardedAt,
  }));

const arbitraryBoard: fc.Arbitrary<Board> = fc
  .tuple(
    fc.array(arbitraryActiveItem(fc.constant(null)), { maxLength: 3 }),
    fc.array(arbitraryActiveItem(arbitraryNonEmptyDescription), { maxLength: 3 }),
    fc.array(arbitraryCompleteItem, { maxLength: 3 }),
    fc.array(arbitraryDiscardedItem, { maxLength: 3 }),
  )
  .map(([newItems, wipItems, complete, discarded]) => ({
    new: newItems,
    wip: wipItems,
    complete,
    discarded,
  }));

describe('serialize/parse round trip', () => {
  it('parse(serialize(board)) deep-equals board, for evil boards including headings, fences, and unicode in descriptions', () => {
    fc.assert(
      fc.property(arbitraryBoard, (board) => {
        const text = serialize(board);
        const result = parse(text);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.warnings).toHaveLength(0);
        expect(boardsEqual(result.value.board, board)).toBe(true);
      }),
      { numRuns: 10_000 },
    );
  });
});
