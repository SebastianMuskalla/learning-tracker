import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '../../../src/domain/result';
import type { Migration } from '../../../src/format/migrations/types';
import { describeUpgradeError, upgrade } from '../../../src/format/migrations/run';

const marker = (n: number): string => `<!-- version:${String(n)} -->\n\nbody`;

function step(from: number, calls: number[] = []): Migration {
  return {
    from,
    description: `step ${String(from)}`,
    migrate: (text) => {
      calls.push(from);
      return ok(text.replace(`version:${String(from)}`, `version:${String(from + 1)}`));
    },
  };
}

describe('upgrade', () => {
  it('applies the steps in order and reports them', () => {
    const calls: number[] = [];
    const result = upgrade(marker(37), [step(37, calls), step(38, calls)], 39);
    expect(calls).toEqual([37, 38]);
    expect(result).toEqual({
      ok: true,
      value: {
        kind: 'migrated',
        text: marker(39),
        from: 37,
        steps: [
          { from: 37, description: 'step 37' },
          { from: 38, description: 'step 38' },
        ],
      },
    });
  });

  it('does nothing for a file at the current version', () => {
    const migrate = vi.fn(() => ok(''));
    const result = upgrade(marker(39), [{ from: 38, description: '', migrate }], 39);
    expect(result).toEqual({ ok: true, value: { kind: 'current' } });
    expect(migrate).not.toHaveBeenCalled();
  });

  it('rejects a file that is newer than the app', () => {
    expect(upgrade(marker(40), [], 39)).toEqual({
      ok: false,
      error: { type: 'TooNew', fileVersion: 40, appVersion: 39 },
    });
  });

  it('stops at a failing step and does not run later steps', () => {
    const calls: number[] = [];
    const failing: Migration = {
      from: 37,
      description: 'fails',
      migrate: () => err({ line: 4, reason: 'bad' }),
    };
    const result = upgrade(marker(37), [failing, step(38, calls)], 39);
    expect(result).toEqual({
      ok: false,
      error: { type: 'MigrationFailed', from: 37, error: { line: 4, reason: 'bad' } },
    });
    expect(calls).toEqual([]);
  });

  it('reports a step that does not update the marker', () => {
    const lazy: Migration = { from: 37, description: 'lazy', migrate: (text) => ok(text) };
    const result = upgrade(marker(37), [lazy], 38);
    expect(result).toMatchObject({ ok: false, error: { type: 'MigrationBroken', from: 37 } });
  });

  it('reports a missing step', () => {
    expect(upgrade(marker(37), [], 38)).toMatchObject({
      ok: false,
      error: { type: 'MigrationBroken', from: 37 },
    });
  });

  it('passes on a version error', () => {
    expect(upgrade('hello', [], 2)).toEqual({ ok: false, error: { type: 'NoVersionMarker' } });
  });
});

describe('describeUpgradeError', () => {
  it('describes every error', () => {
    expect(describeUpgradeError({ type: 'NoVersionMarker' }).line).toBe(0);
    expect(describeUpgradeError({ type: 'InvalidVersionMarker', line: 3, found: 'x' }).line).toBe(3);
    expect(describeUpgradeError({ type: 'TooNew', fileVersion: 5, appVersion: 2 }).reason).toBe(
      'learning.md uses format version 5, but this app knows only versions up to 2. Reload the page to get the newest version of the app.',
    );
    expect(
      describeUpgradeError({ type: 'MigrationFailed', from: 1, error: { line: 2, reason: 'bad' } }),
    ).toEqual({ line: 2, reason: 'Could not upgrade learning.md from format v1 to v2: bad' });
    expect(
      describeUpgradeError({ type: 'MigrationFailed', from: 1, error: { line: null, reason: 'bad' } }).line,
    ).toBe(0);
    expect(describeUpgradeError({ type: 'MigrationBroken', from: 1, reason: 'oops' }).reason).toContain(
      'oops',
    );
  });
});
