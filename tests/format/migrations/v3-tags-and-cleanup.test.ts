// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { migrateV3 } from '../../../src/format/migrations/v3-tags-and-cleanup';
import { parse } from '../../../src/format/parse';
import { serialize } from '../../../src/format/serialize';

const root = fileURLToPath(new URL('./fixtures/v3/', import.meta.url));
const META = '<!-- id:01M2KCX2QA8VMTXY950V44DB2J created:2026-09-15';
const META2 = '<!-- id:01M2KCX2QCRJYQJSQW6XNKE3NY created:2026-09-15';

function file(parts: { tags?: string; new?: string; wip?: string; version?: number }): string {
  const version = String(parts.version ?? 3);
  return `<!-- version:${version} -->\n\n# Learning\n\n${parts.tags ?? ''}## New\n\n${parts.new ?? ''}## WIP\n\n${parts.wip ?? ''}## Complete\n\n## Discarded\n`;
}

function migrated(input: string): string {
  const result = migrateV3.migrate(input);
  if (!result.ok) throw new Error(result.error.reason);
  return result.value;
}

describe('migration 3 → 4', () => {
  it('writes the new version line and accepts CRLF', () => {
    const input = file({}).replace(/\n/g, '\r\n');
    expect(migrated(input)).toBe(file({ version: 4 }));
  });

  it('fails with line 1 for a wrong version line', () => {
    expect(migrateV3.migrate(file({ version: 4 }))).toMatchObject({ ok: false, error: { line: 1 } });
  });

  it('moves tags to a list in the same order', () => {
    const input = file({ new: `### Item\n${META} tags:a,b,c -->\n\n` });
    const expected = file({ version: 4, new: `### Item\n${META}T00:00:00Z -->\n- a\n- b\n- c\n\n` });
    expect(migrated(input)).toBe(expected);
  });

  it('puts the tag list between the metadata line and the fence', () => {
    const input = file({ wip: `### Item\n${META} tags:a -->\n\`\`\`markdown\ntext\n\`\`\`\n\n` });
    const expected = file({
      version: 4,
      wip: `### Item\n${META}T00:00:00Z -->\n- a\n\`\`\`markdown\ntext\n\`\`\`\n\n`,
    });
    expect(migrated(input)).toBe(expected);
  });

  it('converts plain dates in all three timestamp keys, and keeps full timestamps', () => {
    const input = `<!-- version:3 -->\n\n# Learning\n\n## New\n\n## WIP\n\n## Complete\n\n### A\n<!-- id:01M2KCX2QA8VMTXY950V44DB2J created:2026-09-01 completed:2026-09-12T10:11:12Z -->\n\`\`\`markdown\nx\n\`\`\`\n\n## Discarded\n\n### B\n<!-- id:01M2KCX2QCRJYQJSQW6XNKE3NY created:2026-09-01T01:02:03Z discarded:2026-09-02 -->\n`;
    const output = migrated(input);
    expect(output).toContain('created:2026-09-01T00:00:00Z completed:2026-09-12T10:11:12Z -->');
    expect(output).toContain('created:2026-09-01T01:02:03Z discarded:2026-09-02T00:00:00Z -->');
  });

  it('writes tag colors in lower case', () => {
    const output = migrated(file({ tags: '<!-- tag:Vue color:#AACBEE -->\n\n' }));
    expect(output).toContain('<!-- tag:Vue color:#aacbee -->');
  });

  it('removes a fence that has only blank lines', () => {
    const input = file({ new: `### Item\n${META} -->\n\`\`\`markdown\n\n \t\n\`\`\`\n\n` });
    expect(migrated(input)).toBe(file({ version: 4, new: `### Item\n${META}T00:00:00Z -->\n\n` }));
  });

  it('moves a WIP item that lost its description to New', () => {
    const input = file({ wip: `### Item\n${META} -->\n\`\`\`markdown\n\n\`\`\`\n\n` });
    expect(migrated(input)).toBe(file({ version: 4, new: `### Item\n${META}T00:00:00Z -->\n\n` }));
  });

  it('moves items to the correct section, in the order of the version 3 app', () => {
    const input = file({
      new: `### N text\n${META} -->\n\`\`\`markdown\na\n\`\`\`\n\n### N plain\n${META2} -->\n\n`,
      wip: `### W plain\n<!-- id:01M2KCX2QCRJYQJSQW6XNKE3P0 created:2026-09-15 -->\n\n### W text\n<!-- id:01M2KCX2QCRJYQJSQW6XNKE3P1 created:2026-09-15 -->\n\`\`\`markdown\nb\n\`\`\`\n\n`,
    });
    const output = migrated(input);
    const headlines = output.split('\n').filter((line) => line.startsWith('### '));
    expect(headlines).toEqual(['### N plain', '### W plain', '### N text', '### W text']);
    expect(output.indexOf('## WIP')).toBeLessThan(output.indexOf('### N text'));
    expect(output.indexOf('### W plain')).toBeLessThan(output.indexOf('## WIP'));
  });

  it('does not change text inside a description', () => {
    const body = '<!-- id:x created:2026-01-01 tags:b -->\n- a\n### Not an item\n```ts\n```';
    const input = file({ wip: `### Item\n${META} tags:a -->\n\`\`\`\`markdown\n${body}\n\`\`\`\`\n\n` });
    expect(migrated(input)).toContain(`\`\`\`\`markdown\n${body}\n\`\`\`\`\n`);
  });

  it('fails with the line of the opening fence for an unterminated fence', () => {
    const input = file({ wip: `### Item\n${META} -->\n\`\`\`markdown\ntext\n` });
    expect(migrateV3.migrate(input)).toMatchObject({ ok: false, error: { line: 11 } });
  });
});

describe('migration 3 → 4, frozen fixtures', () => {
  const names = readdirSync(root).filter((name) => !name.endsWith('.expected.md'));

  it('finds fixtures', () => {
    expect(names.length).toBeGreaterThan(0);
  });

  it.each(names)('%s gives exactly what the serializer writes', (name) => {
    const output = migrated(readFileSync(`${root}${name}`, 'utf-8'));
    const parsed = parse(output);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // The serializer drops the blank lines between tag definitions and at the end of the file.
    const normalise = (text: string): string => text.replace(/\n\n(?=<!-- tag:)/g, '\n').trimEnd();
    expect(normalise(serialize(parsed.value))).toBe(normalise(output));
  });
});
