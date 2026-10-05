import type { ItemId } from '../domain/types';
import { titleCase, type Keyword } from './keywords';

/** A keyword that links to a target topic. */
export interface LinkKeyword {
  readonly keyword: Keyword;
  readonly targetId: ItemId;
  readonly targetHeadline: string;
}

export interface Hit {
  readonly start: number;
  /** The end of the match, including a plural suffix. */
  readonly end: number;
  readonly target: LinkKeyword;
  readonly plural: boolean;
}

interface Matcher {
  readonly regex: RegExp;
  readonly target: LinkKeyword;
}

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
/** One run of spaces and hyphens in a keyword matches whitespace, one hyphen, or nothing. */
const SEPARATOR_PATTERN = String.raw`(?:\s+|-)?`;

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, String.raw`\$&`);
}

/** The pattern of a keyword form. Only runs of spaces and hyphens between other characters are
 *  separators; a hyphen at the start or at the end must match exactly. */
function patternOf(text: string): string {
  const leading = /^-*/.exec(text)?.[0] ?? '';
  const trailing = /-*$/.exec(text.slice(leading.length))?.[0] ?? '';
  const inner = text.slice(leading.length, text.length - trailing.length);
  const chunks = inner.split(/[ -]+/);
  return escapeRegex(leading) + chunks.map(escapeRegex).join(SEPARATOR_PATTERN) + escapeRegex(trailing);
}

function matchersOf(target: LinkKeyword): Matcher[] {
  // The left boundary: no letter or digit directly before the match.
  const before = String.raw`(?<![\p{L}\p{N}])`;
  const { text, caseMode } = target.keyword;
  switch (caseMode) {
    case 'any':
      return [{ regex: new RegExp(before + patternOf(text), 'giu'), target }];
    case 'exact':
      return [{ regex: new RegExp(before + patternOf(text), 'gu'), target }];
    case 'acronym': {
      const forms = new Set([text, titleCase(text)]);
      return [...forms].map((form) => ({ regex: new RegExp(before + patternOf(form), 'gu'), target }));
    }
  }
}

function isLetterOrDigitAt(text: string, index: number): boolean {
  const codePoint = text.codePointAt(index);
  return codePoint !== undefined && LETTER_OR_DIGIT.test(String.fromCodePoint(codePoint));
}

/**
 * Checks the right side of a match that ends at `end`: an optional lower-case plural suffix
 * (`s` or `es`), then no letter or digit. Returns the end with the suffix, or `null`.
 * This is not part of the regex, because the suffix must be lower case also in a case-insensitive
 * regex.
 */
function rightEnd(text: string, end: number): { end: number; plural: boolean } | null {
  if (!isLetterOrDigitAt(text, end)) return { end, plural: false };
  if (text[end] === 's' && !isLetterOrDigitAt(text, end + 1)) return { end: end + 1, plural: true };
  if (text.startsWith('es', end) && !isLetterOrDigitAt(text, end + 2)) return { end: end + 2, plural: true };
  return null;
}

/** Compiles the keywords once, for many texts. The returned function finds the hits in a text. */
export function createKeywordMatcher(keywords: readonly LinkKeyword[]): (text: string) => Hit[] {
  const matchers = keywords.flatMap(matchersOf);
  return (text) => {
    const candidates: Hit[] = [];
    for (const { regex, target } of matchers) {
      regex.lastIndex = 0;
      let match = regex.exec(text);
      while (match !== null) {
        const right = rightEnd(text, match.index + match[0].length);
        if (right !== null) candidates.push({ start: match.index, ...right, target });
        // Look again from the next character, so that a candidate inside a failed match is found.
        regex.lastIndex = match.index + 1;
        match = regex.exec(text);
      }
    }
    return resolveOverlaps(candidates);
  };
}

/** Finds every keyword hit in `text`, without overlaps, sorted by position. */
export function findKeywordHits(text: string, keywords: readonly LinkKeyword[]): Hit[] {
  return createKeywordMatcher(keywords)(text);
}

/** The longest match wins, then the one that starts first, then the one without a plural suffix. */
function resolveOverlaps(candidates: Hit[]): Hit[] {
  const ordered = [...candidates].sort(
    (a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start || Number(a.plural) - Number(b.plural),
  );
  const accepted: Hit[] = [];
  for (const hit of ordered) {
    if (accepted.every((other) => hit.end <= other.start || hit.start >= other.end)) accepted.push(hit);
  }
  return accepted.sort((a, b) => a.start - b.start);
}
