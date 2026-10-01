import { describe, expect, it } from 'vitest';
import { migrateV0 } from '../../../src/format/migrations/v0-empty-file';

const EXPECTED =
  '# Learning\n\n<!-- learning-tracker: v1 — edit by hand at your own risk; the app validates strictly -->\n\n## New\n\n## WIP\n\n## Complete\n\n## Discarded\n';

describe('migration 0 → 1', () => {
  it.each(['', '\n', '  \r\n\n'])('turns %j into the empty board', (input) => {
    expect(migrateV0.migrate(input)).toEqual({ ok: true, value: EXPECTED });
  });

  it('rejects a file that is not empty', () => {
    expect(migrateV0.migrate('hello')).toEqual({
      ok: false,
      error: { line: null, reason: expect.any(String) },
    });
  });
});
