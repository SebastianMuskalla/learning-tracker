// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from '../../src/format/parse';

const fixturesDir = fileURLToPath(new URL('./fixtures/', import.meta.url));

function fixture(name: string): string {
  return readFileSync(`${fixturesDir}${name}`, 'utf-8');
}

describe('parse — version line', () => {
  it('rejects a file with the version-1 header (the store migrates it first)', () => {
    const text = readFileSync(`${fixturesDir}../migrations/fixtures/v1/valid.md`, 'utf-8');
    const result = parse(text);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.line).toBe(1);
    expect(result.error.reason).toContain('Expected "<!-- version:5 -->"');
  });

  it('accepts several blank lines between the version line and the title', () => {
    const text = fixture('empty.md').replace('<!-- version:5 -->\n\n', '<!-- version:5 -->\n\n\n\n');
    expect(parse(text).ok).toBe(true);
  });
});

describe('parse — valid files', () => {
  it('parses a file with items in every section', () => {
    const result = parse(fixture('valid.md'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.new).toHaveLength(2);
    expect(result.value.wip).toHaveLength(1);
    expect(result.value.complete).toHaveLength(1);
    expect(result.value.discarded).toHaveLength(1);
  });

  it('parses a file with no items in any section', () => {
    const result = parse(fixture('empty.md'));
    expect(result).toEqual({ ok: true, value: { tags: [], new: [], wip: [], complete: [], discarded: [] } });
  });

  it('treats headings, fences, comments, blank lines and unicode inside a description as raw content', () => {
    const result = parse(fixture('evil-descriptions.md'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [item] = result.value.wip;
    expect(item?.description).toContain('# Not a header');
    expect(item?.description).toContain('<!-- id:99999999999999999999999999 created:1999-01-01 -->');
    expect(item?.description).toContain('<!-- /desc -->\n````\nfour backticks');
    expect(item?.description).toContain('café, 日本語, emoji 🎉');
  });

  it('accepts CRLF line endings, normalising them to LF', () => {
    const crlf = fixture('valid.md').replace(/\n/g, '\r\n');
    const result = parse(crlf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.wip[0]?.description).not.toContain('\r');
  });

  it('keeps full timestamps as written', () => {
    const result = parse(fixture('timestamps.md'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.new).toMatchObject([
      { headline: 'Full timestamp', createdAt: '2026-09-16T14:32:07Z' },
      { headline: 'Midnight timestamp', createdAt: '2026-09-15T00:00:00Z' },
    ]);
    expect(result.value.complete).toMatchObject([
      { createdAt: '2026-09-01T08:00:00Z', completedAt: '2026-09-12T17:45:30Z' },
    ]);
  });

  it('parses tag definitions in file order, and items with zero, one, and two tags', () => {
    const result = parse(fixture('tags.md'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tags).toEqual([
      { name: 'vue', color: '#aacbee' },
      { name: 'rust', color: '#f6c9a4' },
    ]);
    expect(result.value.new).toMatchObject([
      { headline: 'No tags', tags: [] },
      { headline: 'One tag', tags: ['vue'] },
      { headline: 'Two tags', tags: ['vue', 'rust'] },
    ]);
  });

  it('reads a `- NAME` line inside a description as text', () => {
    const text = fixture('tags.md').replace(
      '## WIP\n',
      '## WIP\n\n### Text\n<!-- id:01M2KCX2QCRJYQJSQW6XNKE3P9 created:2026-09-15T00:00:00Z -->\n```markdown\n- vue\n- nothing\n```\n',
    );
    const result = parse(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.wip[0]).toMatchObject({ tags: [], description: '- vue\n- nothing' });
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
    ['unterminated-fence.md', 11, 'Unterminated description (missing the closing fence "```")'],
    ['wrong-fence-language.md', 11, 'Expected a description fence "```markdown", found "```md"'],
    ['bad-closing-fence.md', 13, 'The closing fence must be exactly 3 backticks, found "````"'],
    ['desc-marker-in-v3.md', 9, 'Expected section heading "## WIP", found "<!-- desc -->"'],
    ['complete-without-desc.md', 12, 'A Complete item must have a description'],
    ['complete-without-completed-tag.md', 12, 'Malformed metadata for an item under Complete'],
    ['malformed-meta.md', 8, 'Malformed metadata for an item under New'],
    ['both-completed-and-discarded.md', 12, 'Malformed metadata for an item under Complete'],
    ['bad-header.md', 3, 'Expected "# Learning", found "# My Learning Log"'],
    ['unknown-tag-on-item.md', 11, 'Unknown tag "rust" on this item'],
    ['duplicate-tag-definition.md', 6, 'Duplicate tag "Vue"'],
    [
      'invalid-tag-color.md',
      5,
      'Invalid tag color: "#zzzzzz" is not a valid color (expected # and 6 lower-case hex digits)',
    ],
    [
      'invalid-tag-name.md',
      5,
      'Expected section heading "## New", found "<!-- tag:web dev color:#aacbee -->"',
    ],
    ['reserved-tag-definition.md', 5, 'Invalid tag name: "Uncategorized" is a reserved name'],
    ['reserved-tag-line.md', 9, 'Invalid tag: "Uncategorized" is a reserved name'],
    ['duplicate-tag-on-item.md', 12, 'Duplicate tag "vue" on this item'],
    ['completed-under-wip.md', 10, 'Malformed metadata for an item under WIP'],
    ['discarded-under-complete.md', 12, 'Malformed metadata for an item under Complete'],
    ['description-under-new.md', 8, 'An item with a description must be under WIP, not New'],
    ['no-description-under-wip.md', 10, 'An item without a description must be under New, not WIP'],
    ['empty-fence.md', 11, 'Empty description'],
    ['plain-date.md', 8, 'Malformed metadata for an item under New'],
    ['uppercase-color.md', 5, 'Invalid tag color: "#AACBEE"'],
    ['tags-in-metadata.md', 10, 'Malformed metadata for an item under New'],
    ['tag-wrong-case.md', 11, 'Unknown tag "Vue" on this item'],
    ['tag-star-marker.md', 12, 'Expected section heading "## WIP", found "* vue"'],
    ['tag-plus-marker.md', 12, 'Expected section heading "## WIP", found "+ vue"'],
    ['tag-no-space.md', 12, 'Expected section heading "## WIP", found "-vue"'],
    ['tag-two-spaces.md', 12, 'Expected section heading "## WIP", found "-  vue"'],
    ['tag-trailing-space.md', 12, 'Expected section heading "## WIP", found "- vue "'],
    ['tag-empty.md', 12, 'Expected section heading "## WIP", found "- "'],
    ['tag-with-comma.md', 12, 'Invalid tag: "vue,rust" is not a valid tag name'],
    ['blank-before-tags.md', 12, 'Expected section heading "## WIP", found "- vue"'],
    ['blank-inside-tags.md', 14, 'Expected section heading "## WIP", found "- rust"'],
    ['blank-before-fence.md', 13, 'Expected section heading "## WIP", found "```markdown"'],
    ['tag-after-fence.md', 16, 'Expected section heading "## Complete", found "- vue"'],
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

describe('parse — fences', () => {
  it('accepts a hand-written fence that is longer than necessary', () => {
    const text = fixture('valid.md')
      .replace('````markdown\n## Notes', '``````markdown\n## Notes')
      .replace('```\n````\n', '```\n``````\n');
    const result = parse(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.wip[0]?.description).toContain('## Notes');
  });

  it('rejects a closing fence with trailing spaces', () => {
    const result = parse(fixture('bad-closing-fence.md').replace('````\n', '``` \n'));
    expect(result).toMatchObject({ ok: false, error: { line: 13 } });
  });
});

describe('parse — error messages (E8)', () => {
  it('never shows internal JSON to the user', () => {
    const text = fixture('valid.md').replace('created:2026-09-15T00:00:00Z', 'created:2026-13-45T00:00:00Z');
    const result = parse(text);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toContain('"2026-13-45T00:00:00Z" is not a valid timestamp');
    expect(result.error.reason).not.toContain('{');
  });
});
