import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const indexHtml = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf-8');

/** The directives of the Content-Security-Policy in `index.html`, by name. */
function directives(): Map<string, string[]> {
  const match = /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(indexHtml);
  if (match?.[1] === undefined) throw new Error('index.html has no Content-Security-Policy');
  return new Map(
    match[1]
      .split(';')
      .map((part) => part.trim().split(/\s+/))
      .filter((words) => words[0] !== undefined && words[0] !== '')
      .map(([name = '', ...values]) => [name, values]),
  );
}

describe('Content-Security-Policy', () => {
  it('lets scripts connect only to the GitHub API', () => {
    expect(directives().get('connect-src')).toEqual(['https://api.github.com']);
  });

  it('allows images from each HTTPS host', () => {
    expect(directives().get('img-src')).toContain('https:');
  });

  it('loads scripts only from the app itself', () => {
    expect(directives().get('script-src')).toEqual(["'self'"]);
  });
});
