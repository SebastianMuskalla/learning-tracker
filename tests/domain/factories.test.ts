import { describe, expect, it } from 'vitest';
import {
  generateItemId,
  makeHeadline,
  makeIsoTimestamp,
  makeItemId,
  makeOptionalDescription,
  nowTimestamp,
} from '../../src/domain/factories';

describe('makeHeadline', () => {
  it('accepts a trimmed single-line headline', () => {
    const result = makeHeadline('  Kubernetes operators  ');
    expect(result).toEqual({ ok: true, value: 'Kubernetes operators' });
  });

  it('rejects empty headlines', () => {
    expect(makeHeadline('   ').ok).toBe(false);
  });

  it('rejects multiline headlines', () => {
    expect(makeHeadline('line one\nline two').ok).toBe(false);
  });

  it('rejects headlines containing a comment marker', () => {
    expect(makeHeadline('gotcha <!-- id:x -->').ok).toBe(false);
  });
});

describe('makeOptionalDescription', () => {
  it('returns null for blank input', () => {
    expect(makeOptionalDescription('   \n  ')).toEqual({ ok: true, value: null });
  });

  it('strips leading and trailing blank lines but keeps interior structure', () => {
    const result = makeOptionalDescription('\n\n## Notes\n\ncode here\n\n\n');
    expect(result).toEqual({ ok: true, value: '## Notes\n\ncode here' });
  });

  it('normalises CRLF to LF', () => {
    const result = makeOptionalDescription('line one\r\nline two');
    expect(result).toEqual({ ok: true, value: 'line one\nline two' });
  });

  it('rejects text containing the reserved end marker', () => {
    expect(makeOptionalDescription('before <!-- /desc --> after').ok).toBe(false);
  });
});

describe('makeIsoTimestamp', () => {
  it('accepts a full UTC timestamp', () => {
    expect(makeIsoTimestamp('2026-09-15T14:32:07Z')).toEqual({ ok: true, value: '2026-09-15T14:32:07Z' });
  });

  it('accepts a legacy date-only value, keeping it as-is', () => {
    expect(makeIsoTimestamp('2026-09-15')).toEqual({ ok: true, value: '2026-09-15' });
  });

  it('rejects malformed strings', () => {
    expect(makeIsoTimestamp('15-09-2026').ok).toBe(false);
  });

  it('rejects dates that do not exist', () => {
    expect(makeIsoTimestamp('2026-02-30').ok).toBe(false);
    expect(makeIsoTimestamp('2026-02-30T00:00:00Z').ok).toBe(false);
  });

  it('rejects an out-of-range time of day', () => {
    expect(makeIsoTimestamp('2026-09-15T24:00:00Z').ok).toBe(false);
    expect(makeIsoTimestamp('2026-09-15T00:60:00Z').ok).toBe(false);
  });
});

describe('nowTimestamp', () => {
  it('generates a full UTC timestamp that makeIsoTimestamp accepts', () => {
    const ts = nowTimestamp();
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(makeIsoTimestamp(ts)).toEqual({ ok: true, value: ts });
  });
});

describe('item ids', () => {
  it('generates ids that the factory accepts', () => {
    const id = generateItemId();
    expect(makeItemId(id)).toEqual({ ok: true, value: id });
  });

  it('generates unique, monotonically sortable ids', () => {
    const a = generateItemId();
    const b = generateItemId();
    expect(a).not.toBe(b);
    expect(a < b).toBe(true);
  });

  it('rejects malformed ids', () => {
    expect(makeItemId('not-a-ulid').ok).toBe(false);
  });
});
