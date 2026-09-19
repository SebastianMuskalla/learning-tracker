# Learning Tracker

Learning Tracker is a single-page web app. You use it to track learning topics.
Each topic moves through four states: **New**, **WIP** (work in progress),
**Complete**, and **Discarded**.

The app stores your topics in one Markdown file, `learning.md`. This file
lives in a private GitHub repository. The app reads and writes the file
through the GitHub API. A quiet moment after you stop making changes
becomes one commit; see "Saving and conflicts" below.

The app has no backend server. It runs only in your browser. You host it as
a static site on GitHub Pages.

## How data and access work

The app uses two GitHub repositories:

1. **The app repository.** This holds the app's code. GitHub Pages serves it
   as a public website. It has no user data in it.
2. **The data repository.** This holds your `learning.md` file. You make
   this repository **private**.

You do not log in with your GitHub account. Instead, you create a
**fine-grained personal access token** (a "token" from here on). You give
this token access to the data repository only. You paste the token into the
app once. The app then uses the token to talk to the GitHub API.

The website itself is public. Only someone with your token can read or
write your data.

## Step 1: Create the data repository

1. On GitHub, create a new repository. Use a name such as `learning-data`.
2. Set its visibility to **Private**.
3. Add a file named `learning.md` to it. An empty file is fine. If you skip
   this step, the app offers to create the file for you on first run.

## Step 2: Create the fine-grained token

The app needs a token with narrow, specific access. Follow these steps
exactly. Do not grant more access than listed here.

1. Go to **github.com → Settings → Developer settings → Personal access
   tokens → Fine-grained tokens**.
2. Click **Generate new token**.
3. Fill in the form:

   | Field             | Value                                                                           |
   | ----------------- | ------------------------------------------------------------------------------- |
   | Token name        | Any name you like, e.g. `learning-tracker`                                      |
   | Expiration        | The longest option GitHub offers (up to 1 year)                                 |
   | Resource owner    | Your GitHub account (or the organization that owns the data repository)         |
   | Repository access | **Only select repositories** → choose the data repository, e.g. `learning-data` |

4. Open the **Permissions** section and set **Repository permissions**:

   | Permission                                                                                            | Setting                                                       |
   | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
   | Contents                                                                                              | **Read and write**                                            |
   | Metadata                                                                                              | Read-only (GitHub sets this on its own; you cannot change it) |
   | Everything else (Actions, Administration, Issues, Pages, Pull requests, Secrets, Webhooks, and so on) | **No access**                                                 |

5. Leave **Account permissions** untouched. Every item there must stay at
   **No access**. The app never needs them.
6. Click **Generate token**.
7. Copy the token now. GitHub shows it only this one time.

This token can read and write one file in one repository. It cannot do
anything else on your GitHub account.

**If the token stops working:** a token can expire, or you can revoke it.
When that happens, the app's next request gets a 401 (Unauthorized) error.
The app then shows the setup screen again with a message that explains why.
Paste in a new token to continue.

## Step 3: Deploy the app to GitHub Pages

1. Create a new **public** GitHub repository for the app's code, e.g.
   `learning-tracker`. (GitHub Pages on a free account requires a public
   repository. This is safe: the app repository holds no user data.)
2. Push this project to that repository:

   ```sh
   git remote add origin https://github.com/<you>/learning-tracker.git
   git push -u origin main
   ```

3. On GitHub, open the app repository's **Settings → Pages**. Under
   **Build and deployment**, set **Source** to **GitHub Actions**. You only
   do this once.
4. Push to the `main` branch (or merge a pull request into it). This
   triggers the `deploy.yml` workflow. The workflow builds the app and
   publishes it to GitHub Pages automatically. No further manual steps are
   needed after this.
5. Open the repository's **Actions** tab to watch the workflow run.
6. When the workflow finishes, find your site's URL under **Settings →
   Pages**. It looks like `https://<you>.github.io/learning-tracker/`.

**About the base path:** the app expects to be served from `/learning-tracker/`
(see `vite.config.ts`). If you name the app repository something else, tell
the build about it, using either option:

- In the repository's **Settings → Secrets and variables → Actions →
  Variables**, add a variable named `VITE_BASE` with the value
  `/your-repo-name/`. The `deploy.yml` workflow already reads this variable
  and passes it to the build — no other file needs to change.
- Or, edit the default value directly in `vite.config.ts`.

## Step 4: Connect the app to your data

1. Open the Pages URL from Step 3.
2. The app shows a setup screen. Fill in:
   - **Owner**: your GitHub username (or organization name)
   - **Repository**: the data repository's name, e.g. `learning-data`
   - **Branch**: usually `main`
   - **Path**: usually `learning.md`
   - **Personal access token**: the token from Step 2
   - **Token storage**: how the browser keeps the token (see below)
3. Click **Test connection**. The app tries to read the file and reports
   the result.
4. Click **Save & continue**.

The app now loads your topics and is ready to use.

### Token storage modes

| Mode                        | Where the token is kept                                                        | Use it when                                                   |
| --------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Remember on this device     | Browser `localStorage`                                                         | You use a personal computer                                   |
| This session only           | Browser `sessionStorage`; gone after you close the tab                         | You use a shared or work computer                             |
| Encrypted with a passphrase | `localStorage`, encrypted; you type a passphrase once per session to unlock it | You want the convenience of "remember," with extra protection |

## Development

```sh
pnpm install
pnpm dev          # local dev server
pnpm lint         # eslint --max-warnings 0
pnpm typecheck    # vue-tsc -b --noEmit
pnpm test         # vitest run
pnpm build        # production build (also runs vue-tsc -b)
```

`.github/workflows/ci.yml` runs lint, typecheck, test, and build on every
push and pull request. `.github/workflows/deploy.yml` builds the app and
publishes `dist/` to GitHub Pages on every push to `main` (see Step 3
above).

**Dev-mode note:** the Content-Security-Policy (CSP) tag in `index.html`
(see "Security" below) is active in `pnpm dev` too. It blocks two things
that only happen during local development: Vite's own auto-reload
connection, and the favicon load over plain `http://`. You will see two
console warnings about this. They are expected. They do not appear in the
production build. Because auto-reload is blocked, refresh the page by hand
after you save a file. This is deliberate. The same strict CSP that
protects the live app also runs locally. The app does not relax it for
convenience.

## The `learning.md` file format

You can open and edit `learning.md` by hand on github.com. But the app's
parser is strict. If a line does not match the expected format, the app
shows a parse error. It will not guess what you meant. This protects your
data: a typo should cause a clear error, not silent data loss.

```
file        := header section('New') section('WIP') section('Complete') section('Discarded')
header      := '# Learning' NL blank* '<!-- learning-tracker: v1 — …' NL blank*
section(S)  := '## ' S NL blank* item*
item        := '### ' headline NL
               '<!-- ' meta (' ' meta)* ' -->' NL
               desc?
               blank*
meta        := 'id:' ULID | 'created:' TIMESTAMP | 'completed:' TIMESTAMP | 'discarded:' TIMESTAMP
desc        := '<!-- desc -->' NL rawline* '<!-- /desc -->' NL
rawline     := any line that is not exactly '<!-- /desc -->'
blank       := an empty line (outside desc blocks)
```

Rules for hand edits:

- Keep the header line and the `learning-tracker: v1` comment exactly as
  the app wrote them.
- Keep all four sections, in this order: New, WIP, Complete, Discarded.
  Keep every section even when it is empty.
- Inside a `<!-- desc -->` … `<!-- /desc -->` block, write anything you
  want. Headings, code fences, other comments, and blank lines are all
  plain text there. The app only looks for one exact line to end the
  block: `<!-- /desc -->`.
- Because of this, a description can never contain the exact text
  `<!-- /desc -->`. The app blocks this text and explains why.
- Write each headline on a single line. Do not put `<!--` in a headline.
- A topic's section (New or WIP) depends on whether it has a description.
  If you place a topic under the wrong one by hand, the app still loads it.
  It shows a warning and fixes the placement the next time it saves.
- A topic under **Complete** must have both a `completed:` timestamp and a
  description. Without them, the app reports an error instead of guessing.
- A topic cannot have both a `completed:` timestamp and a `discarded:`
  timestamp. Two topics cannot share the same `id`. Both cases are errors.
- A `TIMESTAMP` is either the full UTC form the app writes,
  `2026-09-16T14:32:07Z`, or a plain date, `2026-09-16`, for files written
  before the app tracked time of day. The app reads both. It only writes
  the full form.
- The app always writes line endings as `\n`. It also accepts `\r\n` when
  it reads a file, and converts them.

Before every save, the app reads back what it is about to write and
compares it with its own in-memory data. If the two do not match exactly,
the app stops and saves nothing. This check runs on every save, and a
dedicated test (`tests/format/roundtrip.property.test.ts`) checks it against
10,000 generated examples, including deliberately awkward ones (headings,
code fences, and Unicode text inside descriptions).

The file can fail to parse. A hand-edit mistake is one common cause. When
this happens, the app shows the error with a line number. It links to the
file on github.com. It blocks all further writes until you fix the file.
Your last good version is always in the repository's git history.

## Saving and conflicts

The app does not send one commit per click. It waits about a second after
your last change, then writes everything from that burst as one commit. A
long burst of changes, or ten changes in a row, forces a write sooner, so
nothing waits too long. While a write is pending or in progress, the bottom
corner shows "Unsaved changes…" or "Saving…".

If you try to close the tab (or reload it) while a write is still pending,
the browser asks you to confirm, so you do not lose it by accident. The app
also tries to send the pending write right away when the tab is hidden or
closed, as a best effort; the confirmation prompt is the backstop for when
that does not finish in time.

Sometimes a write is rejected because the file changed on GitHub in the
meantime. Most of the time this is not a real conflict — for example, GitHub
can briefly answer a read with an older version of the file right after a
write, or two changes to different topics do not actually clash. The app
reads the current file, and:

- if it turns out nothing you care about actually changed, it retries the
  write on its own;
- if the changes are to different topics (or the same topic changed the
  same way twice), it combines both automatically and retries;
- only when the _same_ topic was changed differently in both places does it
  ask you. It then shows your version and GitHub's version side by side, and
  you pick which one to keep — the other is discarded.

Refreshing the page, or switching back to the tab after a while, re-reads
`learning.md` from GitHub — unless a write is still pending, so a refresh
can never throw away work you have not saved yet.

## Security

- The token is sent only to `https://api.github.com`. A
  Content-Security-Policy tag in `index.html` enforces this in the
  browser; the app cannot send it anywhere else, by accident or otherwise.
- The token is never written into the URL, into the app's code, or into
  any commit.
- All Markdown you write is rendered with `markdown-it` (with raw HTML
  turned off) and then cleaned with DOMPurify before it is shown. This
  guards against a description that contains a script trying to run in
  your browser.
- Links inside a description open with `rel="noopener noreferrer"` and in
  a new tab.
- Someone can steal your token from a device. If that happens, they get
  read and write access to one file, in one private repository. They get
  nothing else. Use the narrow permissions from Step 2. Choose the storage
  mode from Step 4 that best fits the device you use.

## Future ideas

- Search functionality
- Tags
- Syntax highlighting for languages
