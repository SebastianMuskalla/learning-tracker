export interface GithubRepoConfig {
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  readonly path: string;
  readonly token: string;
}

export interface GithubContentsGetResponse {
  readonly content: string;
  readonly encoding: string;
  readonly sha: string;
}

export interface GithubContentsPutResponse {
  readonly content: { readonly sha: string } | null;
  readonly commit: { readonly sha: string };
}

export type GithubClientError =
  | { readonly type: 'Unauthorized' }
  | { readonly type: 'Forbidden'; readonly message: string }
  | { readonly type: 'NotFound' }
  | { readonly type: 'Conflict' }
  | { readonly type: 'RateLimited'; readonly retryAfterSeconds: number | null }
  | { readonly type: 'Network'; readonly message: string }
  /** The file content is not valid UTF-8. Writing it back would destroy the invalid bytes. */
  | { readonly type: 'InvalidUtf8' }
  | { readonly type: 'Unknown'; readonly status: number; readonly message: string };
