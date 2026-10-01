import { describe, expect, it } from 'vitest';
import { migrateV1 } from '../../../src/format/migrations/v1-version-line';

const OLD = '<!-- learning-tracker: v1 — edit by hand at your own risk; the app validates strictly -->';
const BODY = '## New\n\n## WIP\n\n## Complete\n\n## Discarded\n';
const EXPECTED = `<!-- version:2 -->\n\n# Learning\n\n${BODY}`;

describe('migration 1 → 2', () => {
  it('replaces the comment with a version line above the title', () => {
    expect(migrateV1.migrate(`# Learning\n\n${OLD}\n\n${BODY}`)).toEqual({ ok: true, value: EXPECTED });
  });

  it('accepts \\r\\n and extra blank lines', () => {
    const input = `# Learning\r\n\r\n\r\n${OLD}\r\n\r\n\r\n${BODY.replace(/\n/g, '\r\n')}`;
    expect(migrateV1.migrate(input)).toEqual({ ok: true, value: EXPECTED });
  });

  it('fails with the line number for a wrong title', () => {
    expect(migrateV1.migrate(`# Other\n\n${OLD}\n`)).toMatchObject({ ok: false, error: { line: 1 } });
  });

  it('fails with the line number for a changed comment', () => {
    const result = migrateV1.migrate(`# Learning\n\n\n<!-- learning-tracker: v1 -->\n`);
    expect(result).toMatchObject({ ok: false, error: { line: 4 } });
  });

  it('fails for a file that ends after the title', () => {
    expect(migrateV1.migrate('# Learning\n')).toMatchObject({ ok: false, error: { line: 3 } });
  });

  it('does not touch the old comment text inside a description', () => {
    const body = BODY.replace(
      '## WIP\n',
      `## WIP\n\n### Item\n<!-- id:01M2KCX2QA8VMTXY950V44DB2J created:2026-09-15 -->\n<!-- desc -->\n${OLD}\n<!-- /desc -->\n`,
    );
    const result = migrateV1.migrate(`# Learning\n\n${OLD}\n\n${body}`);
    expect(result).toEqual({ ok: true, value: `<!-- version:2 -->\n\n# Learning\n\n${body}` });
  });
});
