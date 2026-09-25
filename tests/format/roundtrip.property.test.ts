import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { boardsEqual } from '../../src/domain/board';
import {
  generateItemId,
  makeHeadline,
  makeHexColor,
  makeIsoTimestamp,
  makeOptionalDescription,
  makeTagName,
} from '../../src/domain/factories';
import { unwrap } from '../../src/domain/result';
import type {
  ActiveItem,
  Board,
  CompleteItem,
  Description,
  DiscardedItem,
  Headline,
  HexColor,
  IsoTimestamp,
  Tag,
  TagName,
} from '../../src/domain/types';
import { parse } from '../../src/format/parse';
import { serialize } from '../../src/format/serialize';
import { TAG_PALETTE } from '../../src/tags/palette';

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

// 0-4 tags, unique names ignoring case, colors from the palette plus a few upper-case hex values.
const arbitraryTagName: fc.Arbitrary<TagName> = fc
  .string({ minLength: 1, maxLength: 10 })
  .map((s) => s.replace(/[^\p{L}\p{N}_-]/gu, 'x'))
  .filter((s) => s.length > 0)
  .map((s) => unwrap(makeTagName(s)));

const arbitraryTagColor: fc.Arbitrary<HexColor> = fc.oneof(
  fc.constantFrom(...TAG_PALETTE.map((p) => p.color)),
  fc.constantFrom('#AACBEE', '#F6C9A4', '#B9DCB8').map((c) => unwrap(makeHexColor(c))),
);

const [fallbackTagColor] = TAG_PALETTE;
if (fallbackTagColor === undefined) throw new Error('TAG_PALETTE must not be empty');

const arbitraryTagList: fc.Arbitrary<readonly Tag[]> = fc
  .uniqueArray(arbitraryTagName, { minLength: 0, maxLength: 4, selector: (n) => n.toLowerCase() })
  .chain((names) =>
    fc
      .array(arbitraryTagColor, { minLength: names.length, maxLength: names.length })
      .map((colors) => names.map((name, i) => ({ name, color: colors[i] ?? fallbackTagColor.color }))),
  );

/** A subset of `tagNames`, in the same (definition) order — an item's tags are always kept in
 *  definition order. */
function arbitraryItemTags(tagNames: readonly TagName[]): fc.Arbitrary<readonly TagName[]> {
  return fc.subarray([...tagNames]);
}

function arbitraryActiveItem(
  description: fc.Arbitrary<Description | null>,
  tags: fc.Arbitrary<readonly TagName[]>,
): fc.Arbitrary<ActiveItem> {
  return fc
    .tuple(arbitraryHeadline, arbitraryDate, description, tags)
    .map(([headline, createdAt, desc, itemTags]) => ({
      id: generateItemId(),
      headline,
      createdAt,
      status: 'active' as const,
      description: desc,
      tags: itemTags,
    }));
}

function arbitraryCompleteItem(tags: fc.Arbitrary<readonly TagName[]>): fc.Arbitrary<CompleteItem> {
  return fc
    .tuple(arbitraryHeadline, arbitraryDate, arbitraryDate, arbitraryNonEmptyDescription, tags)
    .map(([headline, createdAt, completedAt, description, itemTags]) => ({
      id: generateItemId(),
      headline,
      createdAt,
      status: 'complete' as const,
      description,
      completedAt,
      tags: itemTags,
    }));
}

function arbitraryDiscardedItem(tags: fc.Arbitrary<readonly TagName[]>): fc.Arbitrary<DiscardedItem> {
  return fc
    .tuple(arbitraryHeadline, arbitraryDate, arbitraryDate, arbitraryOptionalDescription, tags)
    .map(([headline, createdAt, discardedAt, description, itemTags]) => ({
      id: generateItemId(),
      headline,
      createdAt,
      status: 'discarded' as const,
      description,
      discardedAt,
      tags: itemTags,
    }));
}

const arbitraryBoard: fc.Arbitrary<Board> = arbitraryTagList.chain((tagList) => {
  const tags = arbitraryItemTags(tagList.map((t) => t.name));
  return fc
    .tuple(
      fc.array(arbitraryActiveItem(fc.constant(null), tags), { maxLength: 3 }),
      fc.array(arbitraryActiveItem(arbitraryNonEmptyDescription, tags), { maxLength: 3 }),
      fc.array(arbitraryCompleteItem(tags), { maxLength: 3 }),
      fc.array(arbitraryDiscardedItem(tags), { maxLength: 3 }),
    )
    .map(([newItems, wipItems, complete, discarded]) => ({
      tags: tagList,
      new: newItems,
      wip: wipItems,
      complete,
      discarded,
    }));
});

// 10,000 runs take about 2 s locally, but more than 5 s on slow CI runners with coverage enabled.
const ROUND_TRIP_TIMEOUT_MS = 60_000;

describe('serialize/parse round trip', () => {
  it(
    'parse(serialize(board)) deep-equals board, for evil boards including headings, fences, and unicode in descriptions',
    () => {
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
    },
    ROUND_TRIP_TIMEOUT_MS,
  );
});
