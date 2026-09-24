import { err, ok, type Result } from '../domain/result';
import type {
  GithubClientError,
  GithubContentsGetResponse,
  GithubContentsPutResponse,
  GithubRepoConfig,
} from './types';

const API_ROOT = 'https://api.github.com';
/** Browsers reject `keepalive` requests with a body over 64 KiB. Stay a bit below that. */
export const KEEPALIVE_MAX_BODY_BYTES = 60 * 1024;
/** Error texts from GitHub are cut to this length before they are shown. */
const MAX_ERROR_MESSAGE_LENGTH = 200;

export interface FileContents {
  readonly text: string;
  readonly sha: string;
}

function contentsUrl(config: GithubRepoConfig): string {
  return `${API_ROOT}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodePath(config.path)}`;
}

export async function getFile(config: GithubRepoConfig): Promise<Result<FileContents, GithubClientError>> {
  const url = `${contentsUrl(config)}?ref=${encodeURIComponent(config.branch)}`;
  // GitHub answers with `Cache-Control: private, max-age=60`. The browser's default fetch
  // cache mode is then free to answer a reload from that stale response for up to a minute,
  // which makes the app believe an old `sha` is still current and triggers a false conflict
  // on the next write. `no-store` forces every read to actually reach GitHub.
  const response = await request(url, config.token, { method: 'GET', cache: 'no-store' });
  if (!response.ok) return response;
  const status = response.value.status;

  const body = await readJson(response.value);
  if (!body.ok) return body;
  if (Array.isArray(body.value)) {
    return err({ type: 'Unknown', status, message: 'The path points to a folder, not a file.' });
  }
  if (!isContentsGetResponse(body.value)) {
    return err({ type: 'Unknown', status, message: 'GitHub sent a response in an unexpected format.' });
  }
  if (body.value.encoding === 'none') {
    // The Contents API returns the content of files up to 1 MB only.
    return err({
      type: 'Unknown',
      status,
      message: 'The file is larger than 1 MB, which the GitHub Contents API cannot read.',
    });
  }
  if (body.value.encoding !== 'base64') {
    return err({ type: 'Unknown', status, message: `Unexpected encoding "${body.value.encoding}".` });
  }

  let text: string;
  try {
    text = decodeBase64Utf8(body.value.content);
  } catch (cause) {
    if (cause instanceof TypeError) return err({ type: 'InvalidUtf8' });
    return err({ type: 'Unknown', status, message: 'GitHub sent file content that is not valid base64.' });
  }
  return ok({ text, sha: body.value.sha });
}

export interface PutFileInput {
  readonly text: string;
  readonly sha: string | null;
  readonly message: string;
  /** Lets the request outlive the page. Used only for the best-effort flush when the page closes. */
  readonly keepalive?: boolean;
}

export async function putFile(
  config: GithubRepoConfig,
  input: PutFileInput,
): Promise<Result<{ sha: string }, GithubClientError>> {
  const body = JSON.stringify({
    message: input.message,
    content: encodeBase64Utf8(input.text),
    branch: config.branch,
    ...(input.sha === null ? {} : { sha: input.sha }),
  });
  const keepalive = input.keepalive === true;
  if (keepalive && new TextEncoder().encode(body).length > KEEPALIVE_MAX_BODY_BYTES) {
    // The browser would reject the request anyway. Do not send it.
    return err({
      type: 'Unknown',
      status: 0,
      message: 'The change is too large to send while the page closes.',
    });
  }

  const response = await request(contentsUrl(config), config.token, {
    method: 'PUT',
    body,
    cache: 'no-store',
    ...(keepalive ? { keepalive: true } : {}),
  });
  if (!response.ok) return response;

  const json = await readJson(response.value);
  if (!json.ok) return json;
  if (!isContentsPutResponse(json.value)) {
    return err({
      type: 'Unknown',
      status: response.value.status,
      message: 'PUT response had no content.sha.',
    });
  }
  return ok({ sha: json.value.content.sha });
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
  return err(await mapErrorResponse(response));
}

async function mapErrorResponse(response: Response): Promise<GithubClientError> {
  const { status } = response;
  if (status === 401) return { type: 'Unauthorized' };
  if (status === 404) return { type: 'NotFound' };
  if (status === 409) return { type: 'Conflict' };

  const message = await errorMessageOf(response);
  if (status === 403 || status === 429) {
    const retryAfter = response.headers.get('retry-after');
    const remaining = response.headers.get('x-ratelimit-remaining');
    // GitHub also answers 403 when the token lacks a permission. Only these headers (or a 429)
    // mark a rate limit.
    if (status === 429 || retryAfter !== null || remaining === '0') {
      return { type: 'RateLimited', retryAfterSeconds: retryAfterSeconds(response.headers) };
    }
    return { type: 'Forbidden', message };
  }
  if (status === 422 && /does not match|wasn't supplied|was not supplied/i.test(message)) {
    // 422 about the sha is a stale or missing sha: the same situation as a 409. Every other 422
    // is a validation error, for example an invalid branch name.
    return { type: 'Conflict' };
  }
  return { type: 'Unknown', status, message };
}

/** Seconds until a rate limit ends: from `Retry-After`, or else from `x-ratelimit-reset`. */
function retryAfterSeconds(headers: Headers): number | null {
  const retryAfter = headers.get('retry-after');
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    return Number.isFinite(seconds) ? seconds : null;
  }
  const reset = headers.get('x-ratelimit-reset');
  if (reset !== null) {
    const resetEpochSeconds = Number(reset);
    if (Number.isFinite(resetEpochSeconds)) return Math.max(0, resetEpochSeconds - Date.now() / 1000);
  }
  return null;
}

async function readJson(response: Response): Promise<Result<unknown, GithubClientError>> {
  try {
    const value: unknown = await response.json();
    return ok(value);
  } catch {
    return err({ type: 'Unknown', status: response.status, message: 'Invalid JSON from GitHub.' });
  }
}

/** GitHub's error text: the `message` field of a JSON body, or else the raw body, shortened. */
async function errorMessageOf(response: Response): Promise<string> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    return '';
  }
  let message = text;
  try {
    const parsed: unknown = JSON.parse(text);
    if (isRecord(parsed) && typeof parsed['message'] === 'string') message = parsed['message'];
  } catch {
    // Not JSON: use the raw text.
  }
  message = message.trim();
  return message.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…`
    : message;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isContentsGetResponse(value: unknown): value is GithubContentsGetResponse {
  return (
    isRecord(value) &&
    typeof value['content'] === 'string' &&
    typeof value['encoding'] === 'string' &&
    typeof value['sha'] === 'string'
  );
}

function isContentsPutResponse(
  value: unknown,
): value is GithubContentsPutResponse & { readonly content: { readonly sha: string } } {
  if (!isRecord(value)) return false;
  const content = value['content'];
  return isRecord(content) && typeof content['sha'] === 'string' && content['sha'] !== '';
}

/** Encodes each segment of a slash-separated path, and keeps the slashes. */
export function encodePath(path: string): string {
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

/** Throws a `TypeError` if the bytes are not valid UTF-8, and a `DOMException` if the input is
 *  not valid base64. */
export function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  // `fatal: true` throws on invalid bytes. The default would replace them with U+FFFD without
  // any warning, and the next save would write the replacement characters back.
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
