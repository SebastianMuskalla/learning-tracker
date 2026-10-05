/**
 * How a keyword matches the case of the text (see README.md, "Keyword links"):
 * - `any`: any case.
 * - `acronym`: exactly as written, or in Title case.
 * - `exact`: only exactly as written (keywords with exactly 2 characters).
 */
export type CaseMode = 'any' | 'acronym' | 'exact';

export interface Keyword {
  /** The keyword as it is written in the headline, cleaned. */
  readonly text: string;
  /** The comparison key (see `comparisonKey`). */
  readonly key: string;
  readonly caseMode: CaseMode;
}

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const INNER_UPPER = /(?<=[\p{L}\p{N}])\p{Lu}/u;
const PAREN_GROUP = /\([^()]*\)/g;
const CUT_COLON = /:(?=\s|$)/u;

/**
 * The key that two keywords share when they are "the same": lower case, without whitespace and
 * without hyphens. `Risk assessment`, `Risk-assessment`, and `RISKASSESSMENT` share a key.
 */
export function comparisonKey(text: string): string {
  return text.toLowerCase().replace(/[\s-]+/gu, '');
}

/** Gets the keywords of a headline, in the order of the headline. */
export function extractKeywords(headline: string): Keyword[] {
  let text = headline;
  // 1. Remove balanced groups, from the inside out.
  let previous;
  do {
    previous = text;
    text = text.replace(PAREN_GROUP, '');
  } while (text !== previous);

  // 2. Cut at the first colon that is followed by whitespace or is at the end.
  const colon = CUT_COLON.exec(text);
  if (colon !== null) text = text.slice(0, colon.index);

  const keywords: Keyword[] = [];
  const seenKeys = new Set<string>();
  // 3. Split, 4. clean, 5. drop invalid parts, 6. drop duplicates.
  for (const rawPart of text.split(/[,;]/)) {
    const part = rawPart.trim().replace(/\s+/gu, ' ');
    const length = nonWhitespaceLength(part);
    if (length < 2 || !LETTER_OR_DIGIT.test(part) || /[()]/.test(part)) continue;
    const key = comparisonKey(part);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    keywords.push({ text: part, key, caseMode: caseModeOf(part, length) });
  }
  return keywords;
}

function nonWhitespaceLength(text: string): number {
  return text.match(/\S/gu)?.length ?? 0;
}

function caseModeOf(text: string, length: number): CaseMode {
  if (length === 2) return 'exact';
  return isAcronymLike(text) ? 'acronym' : 'any';
}

/** True when an upper-case letter is not the first character of its word (`OWASP`, `iOS`). A word
 *  is a run of letters and digits. */
function isAcronymLike(text: string): boolean {
  return INNER_UPPER.test(text);
}

/** The Title-case form of a keyword: the first letter in upper case, all other letters in lower case. */
export function titleCase(text: string): string {
  const lower = text.toLowerCase();
  const first = /\p{L}/u.exec(lower);
  if (first === null) return lower;
  const letter = first[0];
  return lower.slice(0, first.index) + letter.toUpperCase() + lower.slice(first.index + letter.length);
}
