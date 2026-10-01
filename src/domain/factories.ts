import { isValid as isValidUlid, monotonicFactory } from 'ulidx';
import { err, ok, type Result } from './result';
import type { Description, HexColor, Headline, IsoTimestamp, ItemId, TagName } from './types';

export type ValidationError =
  | { readonly type: 'EmptyHeadline' }
  | { readonly type: 'MultilineHeadline' }
  | { readonly type: 'HeadlineContainsComment' }
  | { readonly type: 'EmptyDescription' }
  | { readonly type: 'InvalidIsoTimestamp'; readonly value: string }
  | { readonly type: 'InvalidItemId'; readonly value: string }
  | { readonly type: 'InvalidTagName'; readonly value: string }
  | { readonly type: 'ReservedTagName'; readonly value: string }
  | { readonly type: 'InvalidHexColor'; readonly value: string };

/** The name of the filter chip for items without tags. No tag can have this name (ignoring case). */
export const RESERVED_TAG_NAME = 'Uncategorized';

/** A short text for the user that explains a validation error. */
export function describeValidationError(error: ValidationError): string {
  switch (error.type) {
    case 'EmptyHeadline':
      return 'the headline is empty';
    case 'MultilineHeadline':
      return 'the headline has more than one line';
    case 'HeadlineContainsComment':
      return 'the headline contains "<!--"';
    case 'EmptyDescription':
      return 'the description is empty';
    case 'InvalidIsoTimestamp':
      return `"${error.value}" is not a valid timestamp (expected YYYY-MM-DDTHH:MM:SSZ)`;
    case 'InvalidItemId':
      return `"${error.value}" is not a valid item id (expected a ULID)`;
    case 'InvalidTagName':
      return `"${error.value}" is not a valid tag name (letters, digits, "_" or "-", up to 32 characters)`;
    case 'ReservedTagName':
      return `"${RESERVED_TAG_NAME}" is a reserved name`;
    case 'InvalidHexColor':
      return `"${error.value}" is not a valid color (expected # and 6 lower-case hex digits)`;
  }
}

// Full UTC timestamp: `2026-09-16T14:32:07Z`.
const ISO_TIMESTAMP_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;
// Letters, digits, `_`, `-`; no spaces, no commas, no `<`/`>`. The `u` flag makes `\p{L}`/`\p{N}`
// match letters and digits from any script, not just ASCII.
const TAG_NAME_RE = /^[\p{L}\p{N}_-]{1,32}$/u;
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/;

const nextUlid = monotonicFactory();

/** The only place a fresh item id is minted. */
export function generateItemId(): ItemId {
  return nextUlid() as ItemId;
}

export function makeItemId(value: string): Result<ItemId, ValidationError> {
  if (!isValidUlid(value)) {
    return err({ type: 'InvalidItemId', value });
  }
  return ok(value as ItemId);
}

export function makeHeadline(raw: string): Result<Headline, ValidationError> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return err({ type: 'EmptyHeadline' });
  }
  if (trimmed.includes('\n')) {
    return err({ type: 'MultilineHeadline' });
  }
  if (trimmed.includes('<!--')) {
    return err({ type: 'HeadlineContainsComment' });
  }
  return ok(trimmed as Headline);
}

/** Normalises CRLF to LF and strips leading/trailing blank lines; empty result is a validation error. */
export function makeDescription(raw: string): Result<Description, ValidationError> {
  const normalised = raw.replace(/\r\n/g, '\n');
  const stripped = stripBlankEdges(normalised);
  if (stripped.length === 0) {
    return err({ type: 'EmptyDescription' });
  }
  return ok(stripped as Description);
}

/** Like makeDescription, but an empty result means "no description" rather than an error. */
export function makeOptionalDescription(raw: string): Result<Description | null, ValidationError> {
  const normalised = raw.replace(/\r\n/g, '\n');
  const stripped = stripBlankEdges(normalised);
  return ok(stripped.length === 0 ? null : (stripped as Description));
}

function stripBlankEdges(text: string): string {
  const lines = text.split('\n');
  let start = 0;
  while (start < lines.length && lines[start]?.trim() === '') start += 1;
  let end = lines.length - 1;
  while (end >= start && lines[end]?.trim() === '') end -= 1;
  return lines.slice(start, end + 1).join('\n');
}

/** Accepts only the full UTC form (`2026-09-16T14:32:07Z`). The value is kept as given. */
export function makeIsoTimestamp(raw: string): Result<IsoTimestamp, ValidationError> {
  const fullMatch = ISO_TIMESTAMP_RE.exec(raw);
  if (fullMatch) {
    const [, y, mo, d, h, mi, s] = fullMatch.map(Number) as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    if (!isRealCalendarDate(y, mo, d) || h > 23 || mi > 59 || s > 59) {
      return err({ type: 'InvalidIsoTimestamp', value: raw });
    }
    return ok(raw as IsoTimestamp);
  }

  return err({ type: 'InvalidIsoTimestamp', value: raw });
}

function isRealCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function nowTimestamp(): IsoTimestamp {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') as IsoTimestamp;
}

export function makeTagName(raw: string): Result<TagName, ValidationError> {
  const trimmed = raw.trim();
  if (!TAG_NAME_RE.test(trimmed)) {
    return err({ type: 'InvalidTagName', value: raw });
  }
  if (trimmed.toLowerCase() === RESERVED_TAG_NAME.toLowerCase()) {
    return err({ type: 'ReservedTagName', value: raw });
  }
  return ok(trimmed as TagName);
}

/** Accepts lower-case hex digits only, so a color has one way to be written. */
export function makeHexColor(raw: string): Result<HexColor, ValidationError> {
  if (!HEX_COLOR_RE.test(raw)) {
    return err({ type: 'InvalidHexColor', value: raw });
  }
  return ok(raw as HexColor);
}
