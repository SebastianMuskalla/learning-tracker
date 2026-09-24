import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeBase64Utf8, getFile, KEEPALIVE_MAX_BODY_BYTES, putFile } from '../../src/github/client';
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

function errorResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
}

describe('status mapping (E2)', () => {
  async function errorFor(response: Response): Promise<unknown> {
    fetchMock.mockResolvedValue(response);
    const result = await getFile(config);
    expect(result.ok).toBe(false);
    return result.ok ? null : result.error;
  }

  it('401 → Unauthorized', async () => {
    expect(await errorFor(errorResponse(401, { message: 'Bad credentials' }))).toEqual({
      type: 'Unauthorized',
    });
  });

  it('403 without rate-limit headers → Forbidden with GitHub’s message', async () => {
    expect(
      await errorFor(errorResponse(403, { message: 'Resource not accessible by personal access token' })),
    ).toEqual({ type: 'Forbidden', message: 'Resource not accessible by personal access token' });
  });

  it('403 with x-ratelimit-remaining: 0 → RateLimited, wait computed from x-ratelimit-reset', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T12:00:00Z'));
    const resetEpoch = String(Date.parse('2026-09-24T12:01:00Z') / 1000);
    const error = await errorFor(
      errorResponse(
        403,
        { message: 'API rate limit exceeded' },
        { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': resetEpoch },
      ),
    );
    expect(error).toEqual({ type: 'RateLimited', retryAfterSeconds: 60 });
    vi.useRealTimers();
  });

  it('403 with Retry-After → RateLimited with that wait', async () => {
    expect(
      await errorFor(errorResponse(403, { message: 'secondary rate limit' }, { 'retry-after': '30' })),
    ).toEqual({ type: 'RateLimited', retryAfterSeconds: 30 });
  });

  it('429 → RateLimited', async () => {
    expect(await errorFor(errorResponse(429, 'slow down'))).toEqual({
      type: 'RateLimited',
      retryAfterSeconds: null,
    });
  });

  it('404 → NotFound', async () => {
    expect(await errorFor(errorResponse(404, { message: 'Not Found' }))).toEqual({ type: 'NotFound' });
  });

  it('409 → Conflict', async () => {
    expect(await errorFor(errorResponse(409, { message: 'is at abc but expected def' }))).toEqual({
      type: 'Conflict',
    });
  });

  it('422 about the sha → Conflict', async () => {
    expect(await errorFor(errorResponse(422, { message: '"sha" wasn\'t supplied.' }))).toEqual({
      type: 'Conflict',
    });
    expect(await errorFor(errorResponse(422, { message: 'learning.md does not match abc' }))).toEqual({
      type: 'Conflict',
    });
  });

  it('422 for another reason → Unknown with GitHub’s message', async () => {
    expect(
      await errorFor(errorResponse(422, { message: 'Invalid request. Branch name is invalid.' })),
    ).toEqual({
      type: 'Unknown',
      status: 422,
      message: 'Invalid request. Branch name is invalid.',
    });
  });

  it('500 → Unknown with the status; a long body is cut short', async () => {
    const error = await errorFor(errorResponse(500, 'x'.repeat(1000)));
    expect(error).toMatchObject({ type: 'Unknown', status: 500 });
    const message = (error as { message: string }).message;
    expect(message.length).toBeLessThanOrEqual(201);
  });

  it('a network failure → Network', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await getFile(config);
    expect(result).toEqual({ ok: false, error: { type: 'Network', message: 'Failed to fetch' } });
  });
});

describe('getFile response handling (E4, E5)', () => {
  it('round-trips non-ASCII text through base64', async () => {
    const text = 'café, 日本語, emoji 🎉\n';
    fetchMock.mockResolvedValue(
      jsonResponse({ content: encodeBase64Utf8(text), encoding: 'base64', sha: 's1' }),
    );

    expect(await getFile(config)).toEqual({ ok: true, value: { text, sha: 's1' } });
  });

  it('accepts base64 with line breaks, as GitHub sends it', async () => {
    const encoded = encodeBase64Utf8('hello world, this is a longer text');
    const wrapped = `${encoded.slice(0, 10)}\n${encoded.slice(10)}\n`;
    fetchMock.mockResolvedValue(jsonResponse({ content: wrapped, encoding: 'base64', sha: 's1' }));

    expect(await getFile(config)).toEqual({
      ok: true,
      value: { text: 'hello world, this is a longer text', sha: 's1' },
    });
  });

  it('returns InvalidUtf8 for bytes that are not valid UTF-8, instead of replacing them', async () => {
    // "caf\xe9" is Latin-1 for "café"; the lone 0xE9 byte is invalid UTF-8.
    const latin1 = btoa('caf\xe9');
    fetchMock.mockResolvedValue(jsonResponse({ content: latin1, encoding: 'base64', sha: 's1' }));

    expect(await getFile(config)).toEqual({ ok: false, error: { type: 'InvalidUtf8' } });
  });

  it('returns an error (and does not throw) for a body that is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>proxy error</html>', { status: 200 }));

    expect(await getFile(config)).toEqual({
      ok: false,
      error: { type: 'Unknown', status: 200, message: 'Invalid JSON from GitHub.' },
    });
  });

  it('explains that a path pointing to a folder is not a file', async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ name: 'a.md' }]));

    const result = await getFile(config);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.type === 'Unknown' && result.error.message).toContain('folder');
  });

  it('explains the 1 MB limit when GitHub sends no content', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ content: '', encoding: 'none', sha: 's1' }));

    const result = await getFile(config);
    expect(!result.ok && result.error.type === 'Unknown' && result.error.message).toContain('1 MB');
  });

  it('rejects a response with an unexpected shape', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ sha: 's1' }));

    const result = await getFile(config);
    expect(!result.ok && result.error.type).toBe('Unknown');
  });
});

describe('URLs (O2)', () => {
  it('encodes the owner, the repository, the path, and the branch', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ content: encodeBase64Utf8('x'), encoding: 'base64', sha: 's1' }),
    );

    await getFile({ ...config, owner: 'a b', repo: 'r?x', path: 'dir/my file#1.md', branch: 'feature/x' });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(
      'https://api.github.com/repos/a%20b/r%3Fx/contents/dir/my%20file%231.md?ref=feature%2Fx',
    );
  });
});

describe('putFile response handling', () => {
  it('returns an error (and does not throw) for a body that is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('oops', { status: 200 }));

    const result = await putFile(config, { text: 'hello', sha: 's1', message: 'msg' });
    expect(!result.ok && result.error.type).toBe('Unknown');
  });

  it('does not send a keepalive request whose body is too large for the browser', async () => {
    const result = await putFile(config, {
      text: 'x'.repeat(KEEPALIVE_MAX_BODY_BYTES),
      sha: 's1',
      message: 'm',
      keepalive: true,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it('sends a large body without keepalive as normal', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ content: { sha: 's2' }, commit: { sha: 'c2' } }));

    const result = await putFile(config, {
      text: 'x'.repeat(KEEPALIVE_MAX_BODY_BYTES),
      sha: 's1',
      message: 'm',
    });

    expect(result).toEqual({ ok: true, value: { sha: 's2' } });
  });
});
