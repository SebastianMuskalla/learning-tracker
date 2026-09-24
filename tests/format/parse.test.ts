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
      value: { board: { tags: [], new: [], wip: [], complete: [], discarded: [] }, warnings: [] },
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

  it('parses tag definitions in file order, and items with zero, one, and two tags', () => {
    const result = parse(fixture('tags.md'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.board.tags).toEqual([
      { name: 'vue', color: '#aacbee' },
      { name: 'rust', color: '#f6c9a4' },
    ]);
    expect(result.value.board.new).toMatchObject([
      { headline: 'No tags', tags: [] },
      { headline: 'One tag', tags: ['vue'] },
      { headline: 'Two tags', tags: ['vue', 'rust'] },
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
  // Each fixture must fail for its own reason. Checking the reason (not only `ok === false`)
  // makes sure a fixture that was changed by accident, for example by a formatter, fails the test.
  const invalidFixtures: readonly (readonly [name: string, line: number, reason: string])[] = [
    ['missing-section.md', 11, 'Expected section heading "## Discarded", found end of file'],
    ['wrong-section-order.md', 5, 'Expected section heading "## New", found "## WIP"'],
    ['unknown-line.md', 7, 'Expected section heading "## WIP", found "this line is not an item'],
    ['duplicate-id.md', 12, 'Duplicate id "01M2KCX2QA8VMTXY950V44DB2J"'],
    ['unterminated-desc.md', 18, 'Unterminated description block'],
    ['complete-without-desc.md', 13, 'A Complete item must have a description'],
    ['complete-without-completed-tag.md', 16, 'Item under Complete is missing the required metadata'],
    ['malformed-meta.md', 8, 'Malformed metadata comment'],
    ['both-completed-and-discarded.md', 12, 'An item cannot have both completed: and discarded: metadata'],
    ['bad-header.md', 1, 'Expected "# Learning", found "# My Learning Log"'],
    ['unknown-tag-on-item.md', 10, 'Unknown tag "rust" on item "Some item"'],
    ['duplicate-tag-definition.md', 6, 'Duplicate tag "Vue"'],
    ['invalid-tag-color.md', 5, 'Invalid tag color: "#zzzzzz" is not a valid color (expected #rrggbb)'],
    [
      'invalid-tag-name.md',
      5,
      'Expected section heading "## New", found "<!-- tag:web dev color:#aacbee -->"',
    ],
    ['duplicate-tag-on-item.md', 10, 'Duplicate tag "vue" on item "Some item"'],
    [
      'tag-definition-after-new.md',
      7,
      'Expected section heading "## WIP", found "<!-- tag:vue color:#aacbee -->"',
    ],
  ];

  for (const [name, line, reason] of invalidFixtures) {
    it(`rejects ${name} at line ${String(line)} for the expected reason`, () => {
      const result = parse(fixture(name));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.line).toBe(line);
      expect(result.error.reason).toContain(reason);
    });
  }
});

describe('parse — error messages (E8)', () => {
  it('never shows internal JSON to the user', () => {
    const text = fixture('valid.md').replace('created:2026-09-15', 'created:2026-13-45');
    const result = parse(text);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toContain('"2026-13-45" is not a valid timestamp');
    expect(result.error.reason).not.toContain('{');
  });
});
