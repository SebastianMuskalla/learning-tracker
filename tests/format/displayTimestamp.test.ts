import { describe, expect, it } from 'vitest';
import type { IsoTimestamp } from '../../src/domain/types';
import { formatTimestamp } from '../../src/format/displayTimestamp';

describe('formatTimestamp', () => {
  it('formats a full timestamp as local date and time', () => {
    expect(formatTimestamp('2026-09-15T14:32:07Z' as IsoTimestamp)).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
    );
  });

  it.each(['2026-09-15', 'nonsense', '2026-13-45T00:00:00Z'])('shows an em dash for %s', (value) => {
    expect(formatTimestamp(value as IsoTimestamp)).toBe('—');
  });
});
