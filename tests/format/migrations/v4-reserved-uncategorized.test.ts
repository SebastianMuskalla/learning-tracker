// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { migrateV4 } from '../../../src/format/migrations/v4-reserved-uncategorized';
import { parse } from '../../../src/format/parse';

const root = fileURLToPath(new URL('./fixtures/v4/', import.meta.url));
const META = '<!-- id:01M2KCX2QA8VMTXY950V44DB2J created:2026-09-15T00:00:00Z -->';

function migrated(input: string): string {
  const result = migrateV4.migrate(input);
  if (!result.ok) throw new Error(result.error.reason);
  return result.value;
}

describe('migration 4 → 5', () => {
  it('fails with line 1 for a wrong version line', () => {
    expect(migrateV4.migrate('<!-- version:5 -->\n')).toMatchObject({ ok: false, error: { line: 1 } });
  });

  it('fails with the line of the opening fence for an unterminated fence', () => {
    const input = `<!-- version:4 -->\n\n# Learning\n\n## WIP\n\n### Item\n${META}\n\`\`\`markdown\ntext\n`;
    expect(migrateV4.migrate(input)).toMatchObject({ ok: false, error: { line: 9 } });
  });

  it('only writes the new version line for a file without the reserved name', () => {
    const input = `<!-- version:4 -->\n\n# Learning\n\n<!-- tag:vue color:#aacbee -->\n\n## New\n\n### A\n${META}\n- vue\n\n`;
    expect(migrated(input)).toBe(input.replace('version:4', 'version:5'));
  });
});

describe('migration 4 → 5, frozen fixtures', () => {
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
