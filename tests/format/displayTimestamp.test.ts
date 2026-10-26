import { describe, expect, it } from 'vitest';
import type { IsoTimestamp } from '../../src/domain/types';
import { formatTimestamp } from '../../src/format/displayTimestamp';

describe('formatTimestamp', () => {
  it('formats a full timestamp as local date and time', () => {
    expect(formatTimestamp('2026-09-15T14:32:07Z' as IsoTimestamp)).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
    );
  });

  it('uses the time zone of the browser', () => {
    const previous = process.env['TZ'];
    process.env['TZ'] = 'Europe/Berlin';
    try {
      expect(formatTimestamp('2026-09-16T14:32:07Z' as IsoTimestamp)).toBe('2026-09-16 16:32');
    } finally {
      if (previous === undefined) delete process.env['TZ'];
      else process.env['TZ'] = previous;
    }
  });

  it.each(['2026-09-15', 'nonsense', '2026-13-45T00:00:00Z'])('shows an em dash for %s', (value) => {
    expect(formatTimestamp(value as IsoTimestamp)).toBe('—');
  });
});
