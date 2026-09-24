import type { Page, Route } from '@playwright/test';

export const OWNER = 'me';
export const REPO = 'learning-data';
const CONTENTS_PATH = `/repos/${OWNER}/${REPO}/contents/learning.md`;

/**
 * An in-memory stand-in for the GitHub Contents API of one file. It checks the sha like GitHub:
 * a PUT with an old sha gets a 409.
 */
export class FakeGithub {
  text: string | null;
  sha = 'sha-0';
  private version = 0;
  readonly putMessages: string[] = [];

  constructor(initialText: string | null) {
    this.text = initialText;
  }

  /** Changes the file "on GitHub", behind the app's back. */
  setRemote(text: string): void {
    this.text = text;
    this.sha = this.nextSha();
  }

  async install(page: Page): Promise<void> {
    await page.route('https://api.github.com/**', (route) => this.handle(route));
  }

  private nextSha(): string {
    this.version += 1;
    return `sha-${String(this.version)}`;
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname !== CONTENTS_PATH) {
      await route.fulfill({ status: 404, json: { message: 'Not Found' } });
      return;
    }

    if (request.method() === 'GET') {
      if (this.text === null) {
        await route.fulfill({ status: 404, json: { message: 'Not Found' } });
        return;
      }
      await route.fulfill({
        json: {
          content: Buffer.from(this.text, 'utf-8').toString('base64'),
          encoding: 'base64',
          sha: this.sha,
        },
      });
      return;
    }

    if (request.method() === 'PUT') {
      const body: unknown = request.postDataJSON();
      if (typeof body !== 'object' || body === null) {
        await route.fulfill({ status: 400, json: { message: 'Bad request' } });
        return;
      }
      const sha: unknown = Reflect.get(body, 'sha');
      const content: unknown = Reflect.get(body, 'content');
      const message: unknown = Reflect.get(body, 'message');
      const expectedSha = this.text === null ? undefined : this.sha;
      if (sha !== expectedSha || typeof content !== 'string') {
        await route.fulfill({
          status: 409,
          json: { message: `is at ${this.sha} but expected ${String(sha)}` },
        });
        return;
      }
      this.text = Buffer.from(content, 'base64').toString('utf-8');
      this.sha = this.nextSha();
      this.putMessages.push(typeof message === 'string' ? message : '');
      await route.fulfill({ json: { content: { sha: this.sha }, commit: { sha: `commit-${this.sha}` } } });
      return;
    }

    await route.fulfill({ status: 405, json: { message: 'Method not allowed' } });
  }
}

/** Stores the settings and a token, so the app starts on the board, not on the setup screen. */
export async function configure(page: Page): Promise<void> {
  await page.addInitScript(
    ([owner, repo]) => {
      localStorage.setItem(
        'learning-tracker:settings',
        JSON.stringify({ owner, repo, branch: 'main', path: 'learning.md' }),
      );
      localStorage.setItem('learning-tracker:token', 'test-token');
    },
    [OWNER, REPO],
  );
}
