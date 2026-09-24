import { err, ok, type Result } from '../domain/result';
import type {
  GithubClientError,
  GithubContentsGetResponse,
  GithubContentsPutResponse,
  GithubRepoConfig,
} from './types';

const API_ROOT = 'https://api.github.com';

export interface FileContents {
  readonly text: string;
  readonly sha: string;
}

export async function getFile(config: GithubRepoConfig): Promise<Result<FileContents, GithubClientError>> {
  const url = `${API_ROOT}/repos/${config.owner}/${config.repo}/contents/${encodePath(config.path)}?ref=${encodeURIComponent(config.branch)}`;
  // GitHub answers with `Cache-Control: private, max-age=60`. The browser's default fetch
  // cache mode is then free to answer a reload from that stale response for up to a minute,
  // which makes the app believe an old `sha` is still current and triggers a false conflict
  // on the next write. `no-store` forces every read to actually reach GitHub.
  const response = await request(url, config.token, { method: 'GET', cache: 'no-store' });
  if (!response.ok) return response;

  const body = (await response.value.json()) as GithubContentsGetResponse;
  if (body.encoding !== 'base64') {
    return err({
      type: 'Unknown',
      status: response.value.status,
      message: `Unexpected encoding "${body.encoding}"`,
    });
  }
  return ok({ text: decodeBase64Utf8(body.content), sha: body.sha });
}

export interface PutFileInput {
  readonly text: string;
  readonly sha: string | null;
  readonly message: string;
  /** Lets the request outlive the page — used only for the best-effort flush on tab close. */
  readonly keepalive?: boolean;
}

export async function putFile(
  config: GithubRepoConfig,
  input: PutFileInput,
): Promise<Result<{ sha: string }, GithubClientError>> {
  const url = `${API_ROOT}/repos/${config.owner}/${config.repo}/contents/${encodePath(config.path)}`;
  const response = await request(url, config.token, {
    method: 'PUT',
    body: JSON.stringify({
      message: input.message,
      content: encodeBase64Utf8(input.text),
      branch: config.branch,
      ...(input.sha === null ? {} : { sha: input.sha }),
    }),
    cache: 'no-store',
    ...(input.keepalive === true ? { keepalive: true } : {}),
  });
  if (!response.ok) return response;

  const body = (await response.value.json()) as GithubContentsPutResponse;
  const sha = body.content?.sha;
  if (!sha) {
    return err({
      type: 'Unknown',
      status: response.value.status,
      message: 'PUT response had no content.sha',
    });
  }
  return ok({ sha });
}

async function request(
  url: string,
  token: string,
  init: {
    readonly method: 'GET' | 'PUT';
    readonly body?: string;
    readonly cache?: RequestCache;
    readonly keepalive?: boolean;
  },
): Promise<Result<Response, GithubClientError>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method,
      ...(init.body === undefined ? {} : { body: init.body }),
      ...(init.cache === undefined ? {} : { cache: init.cache }),
      ...(init.keepalive === undefined ? {} : { keepalive: init.keepalive }),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
    });
  } catch (cause) {
    return err({ type: 'Network', message: cause instanceof Error ? cause.message : String(cause) });
  }

  if (response.ok) return ok(response);

  if (response.status === 401) return err({ type: 'Unauthorized' });
  if (response.status === 404) return err({ type: 'NotFound' });
  if (response.status === 409 || response.status === 422) return err({ type: 'Conflict' });
  if (response.status === 403 || response.status === 429) {
    const retryAfter = response.headers.get('retry-after');
    return err({ type: 'RateLimited', retryAfterSeconds: retryAfter === null ? null : Number(retryAfter) });
  }
  return err({ type: 'Unknown', status: response.status, message: await safeText(response) });
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}
