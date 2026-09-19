import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeBase64Utf8, getFile, putFile } from '../../src/github/client';
import type { GithubRepoConfig } from '../../src/github/types';

const config: GithubRepoConfig = {
  owner: 'me',
  repo: 'learning-data',
  branch: 'main',
  path: 'learning.md',
  token: 'test-token',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getFile', () => {
  it('bypasses the browser HTTP cache, so a reload never reads a stale sha', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ content: encodeBase64Utf8('hello'), encoding: 'base64', sha: 's1' }),
    );

    await getFile(config);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.cache).toBe('no-store');
  });
});

describe('putFile', () => {
  it('bypasses the browser HTTP cache', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ content: { sha: 's2' }, commit: { sha: 'c2' } }));

    await putFile(config, { text: 'hello', sha: 's1', message: 'msg' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.cache).toBe('no-store');
    expect(init.keepalive).toBeUndefined();
  });

  it('passes keepalive through only when explicitly requested', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ content: { sha: 's2' }, commit: { sha: 'c2' } }));

    await putFile(config, { text: 'hello', sha: 's1', message: 'msg', keepalive: true });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.keepalive).toBe(true);
  });
});
