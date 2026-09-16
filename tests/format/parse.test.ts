// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from '../../src/format/parse';

const fixturesDir = fileURLToPath(new URL('./fixtures/', import.meta.url));

function fixture(name: string): string {
  return readFileSync(`${fixturesDir}${name}`, 'utf-8');
}

describe('parse — valid files', () => {
  it('parses a file with items in every section', () => {
    const result = parse(fixture('valid.md'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.board.new).toHaveLength(2);
    expect(result.value.board.wip).toHaveLength(1);
    expect(result.value.board.complete).toHaveLength(1);
    expect(result.value.board.discarded).toHaveLength(1);
    expect(result.value.warnings).toHaveLength(0);
  });

  it('parses a file with no items in any section', () => {
    const result = parse(fixture('empty.md'));
    expect(result).toEqual({
      ok: true,
      value: { board: { new: [], wip: [], complete: [], discarded: [] }, warnings: [] },
    });
  });

  it('treats headings, fences, comments, blank lines and unicode inside a description as raw content', () => {
    const result = parse(fixture('evil-descriptions.md'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [item] = result.value.board.wip;
    expect(item?.description).toContain('# Not a header');
    expect(item?.description).toContain('<!-- id:99999999999999999999999999 created:1999-01-01 -->');
    expect(item?.description).toContain('<!-- desc -->\nThis looks like a start marker');
    expect(item?.description).toContain('café, 日本語, emoji 🎉');
  });

  it('accepts CRLF line endings, normalising them to LF', () => {
    const crlf = fixture('valid.md').replace(/\n/g, '\r\n');
    const result = parse(crlf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.board.wip[0]?.description).not.toContain('\r');
  });

  it('accepts a mix of full timestamps and legacy date-only values in the same file', () => {
    const result = parse(fixture('mixed-timestamp-formats.md'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.board.new).toMatchObject([
      { headline: 'Full timestamp', createdAt: '2026-09-16T14:32:07Z' },
      { headline: 'Legacy date-only', createdAt: '2026-09-15' },
    ]);
    expect(result.value.board.complete).toMatchObject([
      { createdAt: '2026-09-01T08:00:00Z', completedAt: '2026-09-12T17:45:30Z' },
    ]);
    expect(result.value.board.discarded).toMatchObject([
      { createdAt: '2026-08-20', discardedAt: '2026-09-02T09:15:00Z' },
    ]);
  });

  it('warns, but does not fail, when an active item sits under the wrong New/WIP heading', () => {
    const text = fixture('empty.md').replace(
      '## New\n',
      '## New\n\n### Misplaced\n<!-- id:01M2KCX2QA8VMTXY950V44DB2J created:2026-09-15 -->\n<!-- desc -->\nhas a description\n<!-- /desc -->\n',
    );
    const result = parse(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.board.new).toHaveLength(0);
    expect(result.value.board.wip).toHaveLength(1);
    expect(result.value.warnings).toHaveLength(1);
  });
});

describe('parse — invalid files', () => {
  const invalidFixtures = [
    'missing-section.md',
    'wrong-section-order.md',
    'unknown-line.md',
    'duplicate-id.md',
    'unterminated-desc.md',
    'complete-without-desc.md',
    'complete-without-completed-tag.md',
    'malformed-meta.md',
    'both-completed-and-discarded.md',
    'bad-header.md',
  ];

  for (const name of invalidFixtures) {
    it(`rejects ${name} with a line-numbered error`, () => {
      const result = parse(fixture(name));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(typeof result.error.line).toBe('number');
      expect(result.error.reason.length).toBeGreaterThan(0);
    });
  }
});
