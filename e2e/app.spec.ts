import { expect, test, type Page } from '@playwright/test';
import { emptyBoard } from '../src/domain/board';
import { applyCommand } from '../src/domain/commands';
import { makeHeadline } from '../src/domain/factories';
import { unwrap } from '../src/domain/result';
import type { Board } from '../src/domain/types';
import { parse } from '../src/format/parse';
import { serialize } from '../src/format/serialize';
import { configure, FakeGithub, OWNER, REPO } from './fakeGithub';

function boardWith(...headlines: string[]): Board {
  let board = emptyBoard();
  for (const headline of [...headlines].reverse()) {
    board = unwrap(applyCommand(board, { type: 'add', headline: unwrap(makeHeadline(headline)) }));
  }
  return board;
}

function headlinesOnGithub(github: FakeGithub): string[] {
  if (github.text === null) return [];
  const parsed = parse(github.text);
  if (!parsed.ok) throw new Error(`learning.md does not parse: ${parsed.error.reason}`);
  return [...parsed.value.board.new, ...parsed.value.board.wip].map((item) => item.headline);
}

async function waitUntilSaved(page: Page): Promise<void> {
  await expect(page.locator('.overlay .label')).toHaveText('Saved');
}

test('first setup, create the file, add an item', async ({ page }) => {
  const github = new FakeGithub(null);
  await github.install(page);
  await page.goto('./');

  await page.getByLabel('Owner').fill(OWNER);
  await page.getByLabel('Repository').fill(REPO);
  await page.getByLabel('Personal access token').fill('test-token');
  await page.getByRole('button', { name: 'Save & continue' }).click();

  await page.getByRole('button', { name: 'Create it' }).click();
  await waitUntilSaved(page);

  await page.getByLabel('Add topic').fill('Rust ownership');
  await page.getByLabel('Add topic').press('Enter');
  await expect(page.getByText('Rust ownership')).toBeVisible();
  await waitUntilSaved(page);

  expect(headlinesOnGithub(github)).toEqual(['Rust ownership']);
  expect(github.putMessages).toEqual(['Initialize learning.md', 'Add "Rust ownership"']);
});

test('edit a description with a code block; the code is highlighted', async ({ page }) => {
  const github = new FakeGithub(serialize(boardWith('Topic')));
  await github.install(page);
  await configure(page);
  await page.goto('./');

  await page.getByText('Topic', { exact: true }).click();
  const textarea = page.getByPlaceholder('Notes, links, code — Markdown supported.');
  await textarea.fill('Example:\n\n```ts\nconst x = 1;\n```');
  await page.getByRole('button', { name: 'Send' }).click();
  await waitUntilSaved(page);

  // highlight.js is loaded lazily, as its own chunk; the CSP must allow it.
  await expect(page.locator('.drawer .preview .hljs-keyword').first()).toHaveText('const');
  expect(github.text).toContain('```ts\nconst x = 1;\n```');
});

test('a change on GitHub and a local change are merged after a 409', async ({ page }) => {
  const github = new FakeGithub(serialize(boardWith('First')));
  await github.install(page);
  await configure(page);
  await page.goto('./');
  await expect(page.getByText('First')).toBeVisible();

  // Someone else adds an item on GitHub. The app still has the old sha.
  github.setRemote(serialize(boardWith('Theirs', 'First')));

  await page.getByLabel('Add topic').fill('Mine');
  await page.getByLabel('Add topic').press('Enter');
  await waitUntilSaved(page);

  expect([...headlinesOnGithub(github)].sort()).toEqual(['First', 'Mine', 'Theirs']);
  await expect(page.getByText('Theirs')).toBeVisible();
  await expect(page.getByText('Mine')).toBeVisible();
});

test('the same item changed on both sides shows the conflict dialog', async ({ page }) => {
  const base = boardWith('Shared');
  const github = new FakeGithub(serialize(base));
  await github.install(page);
  await configure(page);
  await page.goto('./');
  await expect(page.getByText('Shared')).toBeVisible();

  const sharedId = base.new[0]?.id;
  if (sharedId === undefined) throw new Error('fixture has no item');
  github.setRemote(
    serialize(
      unwrap(
        applyCommand(base, { type: 'editHeadline', id: sharedId, headline: unwrap(makeHeadline('Theirs')) }),
      ),
    ),
  );

  await page.getByText('Shared').click();
  const headline = page.locator('.drawer input.headline');
  await headline.fill('Mine');
  await headline.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'learning.md changed in two places' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: "Keep GitHub's version" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.locator('.columns').getByText('Theirs')).toBeVisible();
  expect(headlinesOnGithub(github)).toEqual(['Theirs']);
});
