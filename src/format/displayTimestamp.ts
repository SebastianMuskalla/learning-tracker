import type { IsoTimestamp } from '../domain/types';

const FULL_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Formats an item timestamp for display in the browser's local timezone, as `YYYY-MM-DD HH:MM`.
 * A legacy date-only value (written before timestamps included a time) is shown as-is, because
 * its time of day was never recorded. Anything unrecognised falls back to an em dash instead of
 * throwing.
 */
export function formatTimestamp(value: IsoTimestamp): string {
  if (DATE_ONLY_RE.test(value)) return value;
  if (!FULL_TIMESTAMP_RE.test(value)) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  const pad = (n: number): string => String(n).padStart(2, '0');
  const year = String(date.getFullYear());
  return `${year}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
