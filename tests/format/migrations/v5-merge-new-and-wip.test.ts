// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { migrateV5 } from '../../../src/format/migrations/v5-merge-new-and-wip';
import { parse } from '../../../src/format/parse';

const root = fileURLToPath(new URL('./fixtures/v5/', import.meta.url));

function meta(id: string): string {
  return `<!-- id:01M2KCX2QCRJYQJSQW6XNKE3${id} created:2026-09-15T00:00:00Z -->`;
}

function migrated(input: string): string {
  const result = migrateV5.migrate(input);
  if (!result.ok) throw new Error(result.error.reason);
  return result.value;
}

function parsed(text: string) {
  const result = parse(text);
  if (!result.ok) throw new Error(result.error.reason);
  return result.value;
}

describe('migration 5 → 6', () => {
  it('fails with line 1 for a wrong version line', () => {
    expect(migrateV5.migrate('<!-- version:6 -->\n')).toMatchObject({ ok: false, error: { line: 1 } });
  });

  it('fails for a file without a WIP section', () => {
    const input = '<!-- version:5 -->\n\n# Learning\n\n## New\n\n## Complete\n\n## Discarded\n';
    expect(migrateV5.migrate(input)).toMatchObject({ ok: false });
  });

  it('fails with the line of the opening fence for an unterminated fence', () => {
    const input = `<!-- version:5 -->\n\n# Learning\n\n## New\n\n## WIP\n\n### Item\n${meta('P0')}\n\`\`\`markdown\ntext\n`;
    expect(migrateV5.migrate(input)).toMatchObject({ ok: false, error: { line: 11 } });
  });

  // Scenario "Item with a description" of the requirement "WIP items in the migration from version 5".
  it('moves an item with a description from the WIP section to the New section', () => {
    const input = [
      '<!-- version:5 -->',
      '',
      '# Learning',
      '',
      '## New',
      '',
      '## WIP',
      '',
      '### Docker',
      meta('P0'),
      '```markdown',
      'Notes',
      '```',
      '',
      '## Complete',
      '',
      '## Discarded',
      '',
    ].join('\n');
    const output = migrated(input);
    expect(output.split('\n')).not.toContain('## WIP');
    expect(parsed(output).new).toMatchObject([{ headline: 'Docker', status: 'new', description: 'Notes' }]);
  });

  // Scenario "Two sections" of the requirement "Order in the migration from version 5".
  it('puts the old New items first and then the old WIP items, each in the old order', () => {
    const item = (headline: string, id: string, description: boolean): string[] => [
      `### ${headline}`,
      meta(id),
      ...(description ? ['```markdown', `Notes ${headline}`, '```'] : []),
      '',
    ];
    const input = [
      '<!-- version:5 -->',
      '',
      '# Learning',
      '',
      '## New',
      '',
      ...item('A', 'P0', false),
      ...item('B', 'P1', false),
      '## WIP',
      '',
      ...item('C', 'P2', true),
      ...item('D', 'P3', true),
      '## Complete',
      '',
      '## Discarded',
      '',
    ].join('\n');
    expect(parsed(migrated(input)).new.map((entry) => entry.headline)).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('migration 5 → 6, frozen fixtures', () => {
  const names = readdirSync(root).filter((name) => !name.endsWith('.expected.md'));

  it('finds fixtures', () => {
    expect(names.length).toBeGreaterThan(0);
  });

  it.each(names)('%s gives the expected text, which the parser accepts', (name) => {
    const output = migrated(readFileSync(`${root}${name}`, 'utf-8'));
    expect(output).toBe(readFileSync(`${root}${name.replace(/\.md$/, '.expected.md')}`, 'utf-8'));
    expect(parse(output).ok).toBe(true);
  });
});
