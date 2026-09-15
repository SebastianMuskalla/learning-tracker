import { describe, expect, it } from 'vitest';
import {
  generateItemId,
  makeHeadline,
  makeIsoDate,
  makeItemId,
  makeOptionalDescription,
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

describe('makeIsoDate', () => {
  it('accepts a valid calendar date', () => {
    expect(makeIsoDate('2026-09-15')).toEqual({ ok: true, value: '2026-09-15' });
  });

  it('rejects malformed strings', () => {
    expect(makeIsoDate('15-09-2026').ok).toBe(false);
  });

  it('rejects dates that do not exist', () => {
    expect(makeIsoDate('2026-02-30').ok).toBe(false);
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
