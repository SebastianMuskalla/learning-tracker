import { isValid as isValidUlid, monotonicFactory } from 'ulidx';
import { err, ok, type Result } from './result';
import type { Description, Headline, IsoDate, ItemId } from './types';

export type ValidationError =
  | { readonly type: 'EmptyHeadline' }
  | { readonly type: 'MultilineHeadline' }
  | { readonly type: 'HeadlineContainsComment' }
  | { readonly type: 'EmptyDescription' }
  | { readonly type: 'DescriptionContainsEndMarker' }
  | { readonly type: 'InvalidIsoDate'; readonly value: string }
  | { readonly type: 'InvalidItemId'; readonly value: string };

const DESC_END_MARKER = '<!-- /desc -->';
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

export function makeIsoDate(raw: string): Result<IsoDate, ValidationError> {
  if (!ISO_DATE_RE.test(raw)) {
    return err({ type: 'InvalidIsoDate', value: raw });
  }
  const [year, month, day] = raw.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!isRealDate) {
    return err({ type: 'InvalidIsoDate', value: raw });
  }
  return ok(raw as IsoDate);
}

export function today(): IsoDate {
  return new Date().toISOString().slice(0, 10) as IsoDate;
}
