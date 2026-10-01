// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { upgrade } from '../../../src/format/migrations/run';
import { MIGRATIONS } from '../../../src/format/migrations';
import { parse } from '../../../src/format/parse';

const root = fileURLToPath(new URL('./fixtures/', import.meta.url));

const cases = readdirSync(root).flatMap((dir) => {
  const version = Number(dir.slice(1));
  return readdirSync(`${root}${dir}`)
    .filter((name) => !name.endsWith('.expected.md'))
    .map((name) => ({ version, dir, name }));
});

describe('migrating every frozen fixture to the current version', () => {
  it('finds fixtures', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases)('$dir/$name', ({ version, dir, name }) => {
    const text = readFileSync(`${root}${dir}/${name}`, 'utf-8');
    const result = upgrade(text);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.kind !== 'migrated') throw new Error('expected a migration');
    expect(result.value.from).toBe(version);
    expect(parse(result.value.text).ok).toBe(true);
  });
});

const expectedCases = cases.filter(({ dir, name }) =>
  readdirSync(`${root}${dir}`).includes(name.replace(/\.md$/, '.expected.md')),
);

describe('the single step of every fixture with an expected output', () => {
  it.each(expectedCases)('$dir/$name', ({ version, dir, name }) => {
    const text = readFileSync(`${root}${dir}/${name}`, 'utf-8');
    const expected = readFileSync(`${root}${dir}/${name.replace(/\.md$/, '.expected.md')}`, 'utf-8');
    expect(MIGRATIONS[version]?.migrate(text)).toEqual({ ok: true, value: expected });
  });
});
