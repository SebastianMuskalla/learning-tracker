import { describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../../../src/format/migrations';
import { CURRENT_VERSION } from '../../../src/format/version';

describe('MIGRATIONS', () => {
  it('forms a complete chain from 0 to the current version', () => {
    expect(MIGRATIONS.map((m) => m.from)).toEqual(Array.from({ length: CURRENT_VERSION }, (_, i) => i));
  });

  it('has a one-line description for each step', () => {
    for (const migration of MIGRATIONS) {
      expect(migration.description).toMatch(/^[^\n]+$/);
    }
  });
});
