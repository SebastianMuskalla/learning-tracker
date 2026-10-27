# Learning Tracker

Learning Tracker is a single-page web app.
You use the app to track items that you want to learn.
Each item has exactly one of three statuses:
**New**, **Complete**, or **Discarded**.

The app stores your items in one Markdown file, `learning.md`.
This file is in a private GitHub repository.
The app reads and saves the file through the GitHub API.
The app saves each batch of changes as one commit.

The app has no backend server.
It runs only in your browser.
You host it as a static site on GitHub Pages.

## How data and access work

The app uses two GitHub repositories:

1. **The app repository.**
   This holds the code of the app.
   GitHub Pages serves the app from this repository as a public website.
   The app repository has no user data in it.
2. **The data repository.**
   This holds your `learning.md` file.
   You make this repository **private**.

You do not sign in with your GitHub account.
Instead, you create a **fine-grained personal access token** (a "token" from here on).
You give this token access to the data repository only.
You paste the token into the app once.
The app then uses the token for each request to the GitHub API.

The website is public.
Only a person with your token can read or write your data.

## Setup

### Step 1: Create the data repository

1. On GitHub, create a new repository, for example `learning-data`.
2. Set its visibility to **Private**.

### Step 2: Create the fine-grained token

The app needs a token with narrow access.
Follow these steps exactly.
Do not grant more access than this list gives.

1. Go to **github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
2. Click **Generate new token**.
3. Fill in the form:

   | Field             | Value                                                                                  |
   | ----------------- | -------------------------------------------------------------------------------------- |
   | Token name        | A name that you choose, for example `learning-tracker`                                 |
   | Expiration        | The longest option that GitHub offers                                                  |
   | Resource owner    | Your GitHub account, or the organization that owns the data repository                 |
   | Repository access | **Only select repositories** → select the data repository, for example `learning-data` |

4. Open the **Permissions** section and set **Repository permissions**:

   | Permission                                                                                | Setting                            |
   | ----------------------------------------------------------------------------------------- | ---------------------------------- |
   | Contents                                                                                  | **Read and write**                 |
   | Metadata                                                                                  | Read-only. GitHub sets this value. |
   | Each other permission (for example Actions, Administration, Issues, Pages, Pull requests) | **No access**                      |

5. Do not change **Account permissions**. Each item there stays at **No access**.
6. Click **Generate token**.
7. Copy the token now.
   GitHub shows the token only once.

This token can read and write the files of one repository.
The token has no other access to your GitHub account.

**If the token stops working:**
A token can expire, or you can revoke it.
Then the app shows the setup screen again, with a message that tells you the cause.
Paste a new token to continue.
The app keeps the changes that are not saved yet and saves them with the new token.

### Step 3: Deploy the app to GitHub Pages

1. Create a new **public** GitHub repository for the code of the app, for example `learning-tracker`.
   GitHub Pages on a free account requires a public repository.
   This is safe, because the app repository holds no user data.
2. Push this project to that repository:

   ```sh
   git remote add origin https://github.com/<you>/learning-tracker.git
   git push -u origin main
   ```

3. On GitHub, open **Settings → Pages** of the app repository.
   Under **Build and deployment**, set **Source** to **GitHub Actions**.
   You do this only once.
4. Push to the `main` branch.
   Each push starts the `deploy.yml` workflow.
   The workflow builds the app and publishes it to GitHub Pages.
5. Open the **Actions** tab of the repository to watch the workflow run.
6. When the workflow is done, find the URL of your site under **Settings → Pages**,
   for example `https://<you>.github.io/learning-tracker/`.

**About the base path:**
The build serves the app from `/learning-tracker/` (see `vite.config.ts`).
If your app repository has a different name, tell the build in one of two ways:

- In **Settings → Secrets and variables → Actions → Variables** of the repository,
  add a variable named `VITE_BASE` with the value `/your-repo-name/`.
  The `deploy.yml` workflow reads this variable and passes it to the build.
  No file needs to change.
- Or, change the default value in `vite.config.ts`.

### Step 4: Connect the app to your data

1. Open the Pages URL from Step 3.
2. The app shows a setup screen. Fill in:
   - **Owner**: your GitHub user name, or the name of the organization
   - **Repository**: the name of the data repository, for example `learning-data`
   - **Branch**: the branch of the data repository, for example `main`
   - **Path**: the path of the file, for example `learning.md`
   - **Personal access token**: the token from Step 2
3. Click **Test connection**.
   The app tries to read the file and shows the result.
4. Click **Save & continue**.

The app now loads your items. You can change these settings later on the settings page.

## Features

- **Board.**
  The board has one section for each status.
  You add an item with a headline.
  You complete an item only when the item has a description.
  You can complete, reopen, discard, restore, delete, and reorder items.
- **Detail view.**
  Click a card to open the detail view.
  There you edit the headline and the description.
  The app saves a field when you leave it.
- **Rendering.**
  Descriptions are Markdown.
  Code blocks with a language name get syntax highlighting.
- **Search.**
  Press **Ctrl+F** or **Ctrl+K** to search the headlines and descriptions.
  The board then shows only the matching items.
- **Tags.**
  You create colored tags on the settings page and add them to items.
  When you activate filter chips, the board shows only the items with the selected tags.
  The filter chip **Uncategorized** adds the items without a tag.
- **Keywords.**
  The app takes keywords from the headlines of Complete items.
  A keyword in another description becomes a keyword link
  to the item that explains the keyword.
- **Saving.**
  The app saves the changes as one commit when you stop making changes for 800 ms.
  It retries after a temporary error.
  When the same item changed on GitHub and in the app,
  the app asks you which version to keep.
- **Theme and app install.**
  The app has a light and a dark theme.
  A browser such as Chrome can install the app in its own window (as a PWA).
  The app does not work offline.
- **Security.**
  The app sends the token only to `https://api.github.com`,
  and it sanitizes the rendered Markdown.

The specs in `openspec/specs/` describe each feature in detail.

## Glossary

| Term            | Definition                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| app             | The Learning Tracker web app that runs in the browser.                                                           |
| app repository  | The public GitHub repository that holds the code of the app. GitHub Pages serves the app from it.                |
| data repository | The private GitHub repository that holds `learning.md`.                                                          |
| `learning.md`   | The Markdown file in the data repository that stores the items and the tag definitions.                          |
| token           | A fine-grained personal access token of GitHub, with access to the data repository only.                         |
| board           | The main screen of the app. It shows one section for each status.                                                |
| status          | The stage of an item: New, Complete, or Discarded.                                                               |
| section         | The part of the board that shows the items of one status. The board has one section for each status.             |
| section count   | The number of items next to a section title, or "x of y" while a search or a tag filter is active.               |
| item            | One thing to learn, with a headline, an optional description, and zero or more tags.                             |
| headline        | The one-line title of an item.                                                                                   |
| description     | The Markdown text of an item.                                                                                    |
| card            | The view of an item on the board: the headline, the tags, and a preview of the description.                      |
| detail view     | The panel that shows one item and lets the user edit the item.                                                   |
| header bar      | The bar at the top of the board with the "Item" field and the button for the settings page.                      |
| settings page   | The page for the connection settings, the theme, and the tags.                                                   |
| setup screen    | The settings page when the browser stores no connection settings yet, or when GitHub rejected the token.         |
| conflict dialog | The dialog that shows the local version and the GitHub version of each item and tag that changed in both places. |
| tag             | A name with a color that the user adds to items.                                                                 |
| tag chip        | A chip in the detail view that adds one tag to the item or removes the tag from the item.                        |
| tag dot         | A dot in the tag color on a card. A card shows one tag dot for each tag of the item.                             |
| filter chip     | A chip below the header bar of the board. An active filter chip limits the board to the matching items.          |
| tag filter      | The set of active filter chips.                                                                                  |
| Uncategorized   | The filter chip for the items without a tag. `Uncategorized` is a reserved name and cannot be a tag name.        |
| keyword         | A term that the app takes from the headline of an item.                                                          |
| keyword link    | A keyword in a description that opens the target item: the item whose headline gives the keyword.                |
| save            | One request that sends `learning.md` to GitHub. Each successful save creates one commit.                         |
| batch           | The changes that one save sends to GitHub.                                                                       |
| sync status box | The box in the bottom-right corner of the board that shows the save state, for example "Saving…".                |
| format version  | The number N in the first line `<!-- version:N -->` of `learning.md`.                                            |
| migration       | A function that changes `learning.md` from one format version to the next.                                       |
| API             | Application programming interface. The app reads and saves `learning.md` through the GitHub API.                 |
| ASCII           | American Standard Code for Information Interchange: the 128 basic characters of English text.                    |
| HTML            | Hypertext Markup Language: the language of web pages.                                                            |
| HTTP            | Hypertext Transfer Protocol. An HTTP status code such as 401 tells the app the result of a request.              |
| OLED            | Organic light-emitting diode: a screen type that uses no power for a black pixel.                                |
| PWA             | Progressive web app: a website that a browser can install as an app.                                             |
| ULID            | Universally unique lexicographically sortable identifier: the 26-character id of an item.                        |
| URL             | Uniform resource locator: a web address.                                                                         |
| UTC             | Coordinated Universal Time: the time zone of each timestamp in `learning.md`.                                    |

The word "glossary" names only this section. The app feature that links terms is "keywords".

## Development

Use Node 24 and pnpm.
`.nvmrc` names the Node version, so with nvm you run `nvm use`.

```sh
pnpm install
pnpm dev             # local development server
pnpm format          # prettier --write .
pnpm lint            # eslint --fix --max-warnings 0
pnpm test            # vitest run --coverage; fails below the thresholds in vite.config.ts
pnpm build           # type check with vue-tsc -b, then production build
pnpm test:e2e        # browser tests against the build; run `pnpm build` first
```

`pnpm check` runs `lint`, `format`, `test`, `build`, and `test:e2e`.
Run `pnpm check` before you push.
`pnpm check` fixes lint and formatting problems in your files, so the deploy workflow runs separate checks that change no file.

Before the first `pnpm test:e2e`, install the browser once: `pnpm exec playwright install chromium`. The
browser tests in `e2e/` replace the GitHub API with a fake, so they need no token and no network.

To run one unit test file, or the tests whose name matches a text:

```sh
pnpm exec vitest run tests/domain/merge.test.ts
pnpm exec vitest run -t "name of the test"
```

The unit tests run without a document object model (DOM). A test file that needs a DOM starts with the line
`// @vitest-environment jsdom`.

The editor settings in `.vscode/` format each file with Prettier when you save it.
To make `git blame` skip the commits that only changed formatting,
run `git config blame.ignoreRevsFile .git-blame-ignore-revs` once.

`.github/workflows/deploy.yml` is the only workflow.
It runs on each push to `main`:
the format check, lint, the tests with coverage, the build with the type check, and the browser tests.
Only when each check passes, the workflow builds the app again with `VITE_BASE`
and publishes `dist/` to GitHub Pages.
A failing check stops the deploy, but it does not stop the push.

### Development workflow

This project uses spec-driven development with Claude Code and OpenSpec.
The specs in `openspec/specs/` describe what the app does and why.
This README is a human-readable overview only.

Each change follows the OpenSpec workflow: Explore (optional), Propose, Apply, Archive.

The project uses trunk-based development without pull requests.
One change is one commit on `main`.
After each commit, the project works and `pnpm check` passes.

## Future Work

- Artificial intelligence (AI) lookup and fact check
