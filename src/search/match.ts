// Fuzzy search matching: ignore case, spaces, line breaks, and punctuation between letters.
// See doc/requirement-2-search.md section 3.1-3.2 for the design.

export interface NormalizedText {
  /** Lower-cased, with every character that is not a letter or digit removed. */
  readonly text: string;
  /** `map[i]` is the index in the original text of the character that produced `text[i]`. */
  readonly map: readonly number[];
}

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

function codePointLength(text: string, index: number): number {
  const code = text.codePointAt(index);
  return code !== undefined && code > 0xffff ? 2 : 1;
}

/** `map[index]`, asserting what's true by construction: every index `findHits` looks up is one it
 *  just found within `map`'s own bounds. */
function mapIndex(map: readonly number[], index: number): number {
  const value = map[index];
  if (value === undefined) throw new Error('normalize(): index map is shorter than the normalized text');
  return value;
}

export function normalize(text: string): NormalizedText {
  const chars: string[] = [];
  const map: number[] = [];
  let index = 0;
  for (const char of text) {
    if (LETTER_OR_DIGIT.test(char)) {
      // Lower-cased per code point: a single input code point can lower-case to more than one
      // character (e.g. `İ`); every resulting character still maps back to the same origin index.
      for (const lowerChar of char.toLowerCase()) {
        chars.push(lowerChar);
        map.push(index);
      }
    }
    index += char.length;
  }
  return { text: chars.join(''), map };
}

/** Non-overlapping hits of `term` in `text`, as `[start, end)` ranges in the original text. */
export function findHits(text: string, term: string): (readonly [number, number])[] {
  const { text: normText, map } = normalize(text);
  const normTerm = normalize(term).text;
  if (normTerm === '') return [];

  const hits: [number, number][] = [];
  let searchFrom = 0;
  for (;;) {
    const start = normText.indexOf(normTerm, searchFrom);
    if (start === -1) break;
    const end = start + normTerm.length;
    const originalStart = mapIndex(map, start);
    const lastCharStart = mapIndex(map, end - 1);
    const originalEnd = lastCharStart + codePointLength(text, lastCharStart);
    hits.push([originalStart, originalEnd]);
    searchFrom = end;
  }
  return hits;
}

export interface Segment {
  readonly text: string;
  readonly hit: boolean;
}

/** Splits `text` into segments alternating non-hit and hit; segments concatenate back to `text`. */
export function splitIntoSegments(text: string, term: string): Segment[] {
  const hits = findHits(text, term);
  const segments: Segment[] = [];
  let position = 0;
  for (const [start, end] of hits) {
    if (start > position) segments.push({ text: text.slice(position, start), hit: false });
    segments.push({ text: text.slice(start, end), hit: true });
    position = end;
  }
  if (position < text.length) segments.push({ text: text.slice(position), hit: false });
  return segments;
}

export interface SearchableItem {
  readonly headline: string;
  readonly description: string | null;
}

/**
 * An empty term matches everything (the search input is non-empty, e.g. `-`, but normalizes to
 * nothing); it is up to the caller to treat the raw term, not `normalizedTerm`, as the on/off
 * switch for whether a search is active at all.
 */
export function itemMatches(item: SearchableItem, term: string): boolean {
  const normTerm = normalize(term).text;
  if (normTerm === '') return true;
  if (normalize(item.headline).text.includes(normTerm)) return true;
  return item.description !== null && normalize(item.description).text.includes(normTerm);
}
