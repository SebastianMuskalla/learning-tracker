import { describe, expect, it } from 'vitest';
import { describeClientError } from '../../src/github/describeError';
import { githubFileUrl, githubHistoryUrl } from '../../src/github/urls';

describe('describeClientError (E8)', () => {
  it('shows GitHub’s message for Unknown errors, not a raw body', () => {
    expect(describeClientError({ type: 'Unknown', status: 422, message: 'Branch name is invalid.' })).toBe(
      'GitHub API error (422). Details: Branch name is invalid.',
    );
  });

  it('tells the user what to check for a 403', () => {
    expect(describeClientError({ type: 'Forbidden', message: '' })).toContain('Read and write');
  });
});

describe('github.com URLs (O2)', () => {
  const location = { owner: 'me', repo: 'my repo', branch: 'feature/x', path: 'notes/learning #1.md' };

  it('builds the file URL with encoded parts', () => {
    expect(githubFileUrl(location)).toBe(
      'https://github.com/me/my%20repo/blob/feature/x/notes/learning%20%231.md',
    );
  });

  it('builds the history URL with encoded parts', () => {
    expect(githubHistoryUrl(location)).toBe(
      'https://github.com/me/my%20repo/commits/feature/x/notes/learning%20%231.md',
    );
  });
});
