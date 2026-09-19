import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { findHits, itemMatches, normalize, splitIntoSegments } from '../../src/search/match';

describe('normalize + findHits: fuzzy matching', () => {
  it.each([
    ['Some Text', 'Some Text'],
    ['sometext', 'sometext'],
    ['some-text', 'some-text'],
    ['some. text', 'some. text'],
    ['some; text', 'some; text'],
    ['some\n    text', 'some\n    text'],
  ])('"%s" matches "some text"', (_label, haystack) => {
    expect(findHits(haystack, 'some text')).not.toHaveLength(0);
  });

  it('"some tex" matches "some text"', () => {
    expect(findHits('some text', 'some tex')).not.toHaveLength(0);
  });

  it('"text some" does not match "some text"', () => {
    expect(findHits('some text', 'text some')).toHaveLength(0);
  });

  it('"sometextx" does not match "some text"', () => {
    expect(findHits('some text', 'sometextx')).toHaveLength(0);
  });

  it('ignores case for accented letters (Übung / übung)', () => {
    expect(findHits('Übung', 'übung')).not.toHaveLength(0);
  });

  it('ignores case for a Cyrillic term', () => {
    expect(findHits('Привет', 'привет')).not.toHaveLength(0);
  });

  it('keeps digits (v2 matches V 2)', () => {
    expect(findHits('V 2', 'v2')).not.toHaveLength(0);
  });
});

describe('normalize', () => {
  it('drops spaces, line breaks, and punctuation, and lower-cases letters', () => {
    expect(normalize('Some. Text\n  here').text).toBe('sometexthere');
    expect(normalize('some text').text).toBe('sometext');
  });
});

describe('findHits: index map', () => {
  it('maps a hit in "some-text" for term "some text" to the original range [0, 9)', () => {
    expect(findHits('some-text', 'some text')).toEqual([[0, 9]]);
  });

  it('a term that normalizes to empty gives no hits', () => {
    expect(findHits('some text', '-')).toHaveLength(0);
    expect(findHits('some text', '   ')).toHaveLength(0);
  });

  it('finds several, non-overlapping hits, scanning left to right', () => {
    expect(findHits('cat and cat and cat', 'cat')).toEqual([
      [0, 3],
      [8, 11],
      [16, 19],
    ]);
  });

  it('finds exactly two non-overlapping hits of "aa" in "aaaa"', () => {
    expect(findHits('aaaa', 'aa')).toEqual([
      [0, 2],
      [2, 4],
    ]);
  });
});

describe('splitIntoSegments', () => {
  it('concatenates back to the input', () => {
    const segments = splitIntoSegments('some-text here', 'text');
    expect(segments.map((s) => s.text).join('')).toBe('some-text here');
  });

  it('alternates and produces no empty segments', () => {
    const segments = splitIntoSegments('aXbXc', 'X');
    expect(segments.every((s) => s.text.length > 0)).toBe(true);
    const hitFlags = segments.map((s) => s.hit);
    for (let i = 1; i < hitFlags.length; i++) {
      expect(hitFlags[i]).not.toBe(hitFlags[i - 1]);
    }
  });

  it('produces a single non-hit segment when there is no match', () => {
    expect(splitIntoSegments('hello', 'zzz')).toEqual([{ text: 'hello', hit: false }]);
  });

  it('produces no segments for an empty string', () => {
    expect(splitIntoSegments('', 'x')).toEqual([]);
  });
});

describe('itemMatches', () => {
  it('matches on headline only', () => {
    expect(itemMatches({ headline: 'Learn Rust', description: null }, 'rust')).toBe(true);
  });

  it('matches on description only', () => {
    expect(itemMatches({ headline: 'Topic', description: 'about rust' }, 'rust')).toBe(true);
  });

  it('matches when both headline and description match', () => {
    expect(itemMatches({ headline: 'Rust basics', description: 'rust ownership' }, 'rust')).toBe(true);
  });

  it('does not match when neither headline nor description contain the term', () => {
    expect(itemMatches({ headline: 'Topic', description: 'about go' }, 'rust')).toBe(false);
  });

  it('handles a null description', () => {
    expect(itemMatches({ headline: 'Topic', description: null }, 'rust')).toBe(false);
  });

  it('a term that normalizes to empty matches every item', () => {
    expect(itemMatches({ headline: 'Topic', description: null }, '-')).toBe(true);
  });
});

// A rich-enough alphabet (letters, digits, punctuation, whitespace) that random substrings
// usually contain at least one letter or digit, so `fc.pre` below rarely has to discard a run.
const arbitraryText: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...'abcXYZ019 -.;\n\t日本'.split('')), { minLength: 1, maxLength: 40 })
  .map((chars) => chars.join(''));

const arbitraryTextAndSubstring: fc.Arbitrary<[string, string]> = arbitraryText.chain((s) =>
  fc
    .tuple(fc.integer({ min: 0, max: s.length - 1 }), fc.integer({ min: 0, max: s.length }))
    .map(([a, b]) => [s, s.slice(Math.min(a, b), Math.max(a, b))]),
);

describe('property: findHits on any substring', () => {
  it('finds at least one hit for any non-empty (once normalized) substring of a string', () => {
    fc.assert(
      fc.property(arbitraryTextAndSubstring, ([s, term]) => {
        fc.pre(normalize(term).text !== '');
        expect(findHits(s, term).length).toBeGreaterThan(0);
      }),
      { numRuns: 2000 },
    );
  });

  it('every hit range normalizes to the same text as the term', () => {
    fc.assert(
      fc.property(arbitraryTextAndSubstring, ([s, term]) => {
        fc.pre(normalize(term).text !== '');
        for (const [hitStart, hitEnd] of findHits(s, term)) {
          expect(normalize(s.slice(hitStart, hitEnd)).text).toBe(normalize(term).text);
        }
      }),
      { numRuns: 2000 },
    );
  });

  it('segments always concatenate back to the input', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), fc.string({ maxLength: 10 }), (s, term) => {
        const segments = splitIntoSegments(s, term);
        expect(segments.map((seg) => seg.text).join('')).toBe(s);
      }),
      { numRuns: 1000 },
    );
  });
});
