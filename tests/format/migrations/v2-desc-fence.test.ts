// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { migrateV2 } from '../../../src/format/migrations/v2-desc-fence';
import { parse } from '../../../src/format/parse';
import { serialize } from '../../../src/format/serialize';

const root = fileURLToPath(new URL('./fixtures/v2/', import.meta.url));
const META = '<!-- id:01M2KCX2QA8VMTXY950V44DB2J created:2026-09-15 -->';

function file(body: string, version = 2): string {
  return `<!-- version:${String(version)} -->\n\n# Learning\n\n## New\n\n## WIP\n\n${body}\n## Complete\n\n## Discarded\n`;
}

describe('migration 2 → 3', () => {
  it('wraps a description in a fence of 3 backticks', () => {
    const input = file(`### Item\n${META}\n<!-- desc -->\ntext\n<!-- /desc -->\n`);
    const expected = file(`### Item\n${META}\n\`\`\`markdown\ntext\n\`\`\`\n`, 3);
    expect(migrateV2.migrate(input)).toEqual({ ok: true, value: expected });
  });

  it('makes the fence longer than any backtick run inside', () => {
    const input = file(`### Item\n${META}\n<!-- desc -->\n\`\`\`ts\nx\n\`\`\`\n<!-- /desc -->\n`);
    const expected = file(`### Item\n${META}\n\`\`\`\`markdown\n\`\`\`ts\nx\n\`\`\`\n\`\`\`\`\n`, 3);
    expect(migrateV2.migrate(input)).toEqual({ ok: true, value: expected });
  });

  it('treats a marker and a metadata line inside a description as content', () => {
    const input = file(`### Item\n${META}\n<!-- desc -->\n<!-- desc -->\n${META}\n<!-- /desc -->\n`);
    const expected = file(`### Item\n${META}\n\`\`\`markdown\n<!-- desc -->\n${META}\n\`\`\`\n`, 3);
    expect(migrateV2.migrate(input)).toEqual({ ok: true, value: expected });
  });

  it('leaves a stray marker that does not follow a metadata line', () => {
    const input = file('<!-- desc -->\n');
    expect(migrateV2.migrate(input)).toEqual({ ok: true, value: input.replace('version:2', 'version:3') });
  });

  it('fails with line 1 for a wrong version line', () => {
    expect(migrateV2.migrate(file('', 3))).toMatchObject({ ok: false, error: { line: 1 } });
  });

  it('fails with the line of the start marker for an unterminated block', () => {
    const input = file(`### Item\n${META}\n<!-- desc -->\ntext\n`);
    expect(migrateV2.migrate(input)).toMatchObject({ ok: false, error: { line: 11 } });
  });
});

describe('migration 2 → 3, frozen fixtures', () => {
  const names = readdirSync(root).filter((name) => !name.endsWith('.expected.md'));

  it.each(names)('%s gives exactly what the serializer writes', (name) => {
    const output = migrateV2.migrate(readFileSync(`${root}${name}`, 'utf-8'));
    expect(output.ok).toBe(true);
    if (!output.ok) return;
    const parsed = parse(output.value);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // Blank lines between tag definitions are allowed in a file but the serializer drops them.
    const withoutTagGaps = (text: string): string => text.replace(/\n\n(?=<!-- tag:)/g, '\n');
    expect(withoutTagGaps(serialize(parsed.value.board))).toBe(withoutTagGaps(output.value));
  });
});
