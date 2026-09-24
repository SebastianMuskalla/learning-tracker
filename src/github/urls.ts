import { encodePath } from './client';

export interface RepoLocation {
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  readonly path: string;
}

function repoBase(location: RepoLocation): string {
  return `https://github.com/${encodeURIComponent(location.owner)}/${encodeURIComponent(location.repo)}`;
}

/** The page on github.com that shows the file. */
export function githubFileUrl(location: RepoLocation): string {
  return `${repoBase(location)}/blob/${encodePath(location.branch)}/${encodePath(location.path)}`;
}

/** The page on github.com that lists the commits that changed the file. */
export function githubHistoryUrl(location: RepoLocation): string {
  return `${repoBase(location)}/commits/${encodePath(location.branch)}/${encodePath(location.path)}`;
}
