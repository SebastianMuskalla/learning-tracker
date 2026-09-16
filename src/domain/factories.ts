import { isValid as isValidUlid, monotonicFactory } from 'ulidx';
import { err, ok, type Result } from './result';
import type { Description, Headline, IsoTimestamp, ItemId } from './types';

export type ValidationError =
  | { readonly type: 'EmptyHeadline' }
  | { readonly type: 'MultilineHeadline' }
  | { readonly type: 'HeadlineContainsComment' }
  | { readonly type: 'EmptyDescription' }
  | { readonly type: 'DescriptionContainsEndMarker' }
  | { readonly type: 'InvalidIsoTimestamp'; readonly value: string }
  | { readonly type: 'InvalidItemId'; readonly value: string };

const DESC_END_MARKER = '<!-- /desc -->';
// Full UTC timestamp, as written by this app from here on: `2026-09-16T14:32:07Z`.
const ISO_TIMESTAMP_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;
// Legacy date-only value, as written before timestamps were tracked: `2026-09-16`.
const ISO_DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

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
  if (normalised.includes(DESC_END_MARKER)) {
    return err({ type: 'DescriptionContainsEndMarker' });
  }
  const stripped = stripBlankEdges(normalised);
  if (stripped.length === 0) {
    return err({ type: 'EmptyDescription' });
  }
  return ok(stripped as Description);
}

/** Like makeDescription, but an empty result means "no description" rather than an error. */
export function makeOptionalDescription(raw: string): Result<Description | null, ValidationError> {
  const normalised = raw.replace(/\r\n/g, '\n');
  if (normalised.includes(DESC_END_MARKER)) {
    return err({ type: 'DescriptionContainsEndMarker' });
  }
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

/**
 * Accepts either a full UTC timestamp (`2026-09-16T14:32:07Z`, what the app writes from here on)
 * or a legacy date-only value (`2026-09-16`, what older versions of the app wrote); both are
 * kept as given rather than normalised, so a legacy value round-trips without fabricating a time.
 */
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

  const dateMatch = ISO_DATE_ONLY_RE.exec(raw);
  if (dateMatch) {
    const [, y, mo, d] = dateMatch.map(Number) as [number, number, number, number];
    if (!isRealCalendarDate(y, mo, d)) {
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
