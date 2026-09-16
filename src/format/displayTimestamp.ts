const FULL_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Formats an item timestamp for display in the browser's local timezone, as `YYYY-MM-DD HH:MM`.
 * Handles data written before timestamps existed (`null`/`undefined`) or before they included a
 * time (date-only) gracefully instead of throwing: a legacy date-only value is shown as-is (its
 * time of day was never recorded), and anything unrecognised falls back to an em dash.
 */
export function formatTimestamp(value: string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (DATE_ONLY_RE.test(value)) return value;
  if (!FULL_TIMESTAMP_RE.test(value)) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  const pad = (n: number): string => String(n).padStart(2, '0');
  const year = String(date.getFullYear());
  return `${year}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
