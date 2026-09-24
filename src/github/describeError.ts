import type { GithubClientError } from './types';

/** A short text for the user that explains a failed GitHub request. */
export function describeClientError(error: GithubClientError): string {
  switch (error.type) {
    case 'Unauthorized':
      return 'The token was rejected (401). Check it on the settings screen.';
    case 'Forbidden':
      return withGithubMessage(
        'The token cannot write to this repository (403). Check that Contents is set to "Read and write".',
        error.message,
      );
    case 'NotFound':
      return 'learning.md was not found in the repository.';
    case 'Conflict':
      return 'learning.md was changed on GitHub at the same time (409).';
    case 'RateLimited':
      return 'GitHub API rate limit reached.';
    case 'Network':
      return withGithubMessage('Could not reach GitHub.', error.message);
    case 'InvalidUtf8':
      return 'learning.md is not valid UTF-8 text. Fix its encoding on GitHub first.';
    case 'Unknown':
      return withGithubMessage(`GitHub API error (${String(error.status)}).`, error.message);
  }
}

function withGithubMessage(text: string, detail: string): string {
  return detail === '' ? text : `${text} Details: ${detail}`;
}
