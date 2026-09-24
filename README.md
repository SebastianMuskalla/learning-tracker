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
Paste in a new token to continue. The same happens with a 403 (Forbidden)
error, for example when the token has only read access to Contents. Changes
that were not saved yet are kept, and the app saves them with the new token.

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
3. Click **Test connection**. The app tries to read the file and reports
   the result.
4. Click **Save & continue**.

Owner and repository names may contain only letters, digits, `.`, `_`, and
`-`, as on GitHub.

You can change these settings later. If you switch to another repository,
branch, or file while changes are not saved yet, the app first saves them
to the old file. If that fails, it stays on the old file and tells you why.

The app now loads your topics and is ready to use.

## Theme

The app has a light and a dark design. The dark design uses a pure black
background, which saves power on OLED screens. On the settings page, in the
**Theme** section, you pick one of three modes:

- **Device** (the default): the app uses the light or dark design to match
  your device's setting. If the device states no preference, the app uses
  the light design.
- **Light**: always the light design.
- **Dark**: always the dark design.

Your browser remembers the mode (it is not stored in `learning.md`), so it
survives a reload but is not shared between devices.

## Collapsing sections

Click a section's headline (**New**, **WIP**, **Complete**, or
**Discarded**) to collapse it. A collapsed section shows only its title and
its item count, so it takes very little vertical space. Click the headline
again to expand it. This also works while a search or a tag filter is
active; the count then reads "x of y" as usual.

Which sections are collapsed is not saved anywhere. After a reload, all
sections are expanded again.

## Code in descriptions

Descriptions are Markdown. In an item's detail view, a code block is shown
in a box with a slightly tinted background. To get syntax highlighting, name
the language after the opening fence:

````md
```python
print("hello")
```
````

The box then shows the language's name at the top (e.g. `ts` shows as
"TypeScript"), and the code is colored. The colors match the light or dark
theme. About 35 common languages are supported, e.g. JavaScript, TypeScript,
Python, Java, C, C++, C#, Go, Rust, Kotlin, Swift, SQL, Bash, JSON, YAML,
HTML/XML, and CSS (the "common" set of
[highlight.js](https://highlightjs.org/)).

- A code block without a language gets the box, but no label and no colors.
  The app does not guess the language.
- A code block with a language that is not supported gets the box and the
  label, but no colors.
- The card previews on the board show code as plain text, without a box.

## Editing in the detail view

Click a card (or move to it with **Tab** and press **Enter** or **Space**)
to open its detail view. The headline and the description are saved when
you leave the field, press **Ctrl+S** (**Cmd+S** on macOS), click **Send**,
close the detail view, or open another item. A field that you did not
change creates no commit.

If an open item changes while you edit it (for example, because a change
from GitHub was merged in), the field follows the new value as long as you
have not typed anything. If you have, the app keeps your text and shows
"This description changed on GitHub" with two buttons: **Use theirs**
replaces your text with the new value, **Keep mine** saves your text.

## Search

A floating search bar sits in the bottom-left corner of the board, next to
the sync status box. Press **Ctrl+F** or **Ctrl+K** (**Cmd** on macOS) to
jump to it from anywhere, including while editing a description; press the
same keys again while it already has focus to fall back to the browser's own
shortcut.

An item matches when the search term appears in its headline or its
description, ignoring case and ignoring spaces, line breaks, and punctuation
(so `some text` also matches `Some Text`, `sometext`, and `some-text`).
Matching text is highlighted in the list and in the open item's detail view.
While the search bar is not empty, it shows how many items match out of the
total, an X button to clear it, and only matching items appear on the board.
Reordering by drag-and-drop is paused while a search is active, since the
positions on screen no longer line up with the full, unfiltered list.

A card's description preview is clipped to a few lines; if a description
matches the search only further down, or only in a link's target rather
than its visible text, the card shows a short note that it still matches, so
you know to open it.

## Tags

A tag is one word (letters, digits, `_`, or `-`) and one of 16 pastel colors.
Each topic can have any number of tags, including none.

You create, recolor, and delete tags on the settings page, in the **Tags**
section. Creating a tag does not change any topic. Deleting a tag removes
it from every topic that has it, after you confirm; the confirmation shows
how many topics are affected. A tag's color can be changed at any time.

In a topic's detail view, tags appear as chips above the description. A
chip in full color is on the topic; a grayed-out chip is not. Click a chip
to add or remove that tag.

At the top of the board, below the header bar, all tags appear as chips.
Click a chip to make it active (highlighted) or inactive (its normal look);
several chips can be active at once. While at least one tag is active, only
topics with at least one active tag are shown, and each column's count
reads "x of y" (y is the column's full count, x is how many are shown). The
same "x of y" style applies while searching, for the same reason. Dragging
to reorder is paused while a tag filter is active, for the same reason it
pauses during a search.

Which tags are active is remembered by your browser (not stored in
`learning.md`), so it survives a reload but is not shared between devices
or with anyone you share the repository with.

## Development

Use Node 24 (see `.nvmrc`; with nvm: `nvm use`) and pnpm.

```sh
pnpm install
pnpm dev             # local dev server
pnpm format          # prettier --write .
pnpm format:check    # prettier --check . (CI runs this)
pnpm lint            # eslint --max-warnings 0
pnpm lint:fix        # eslint --fix
pnpm typecheck       # vue-tsc -b --noEmit
pnpm test            # vitest run
pnpm test:watch      # vitest in watch mode
pnpm test:coverage   # vitest run --coverage (fails below the thresholds in vite.config.ts)
pnpm build           # production build (also runs vue-tsc -b)
pnpm test:e2e        # browser tests against the build; run `pnpm build` first
```

`pnpm check` runs all of the above in one go, in this order: `lint:fix`,
`lint`, `format`, `format:check`, `typecheck`, `test`, `build`, `test:e2e`.
It stops at the first step that fails. Run it before you push. It fixes
lint and formatting problems in your files, so CI runs the separate
checks instead.

Before the first `pnpm test:e2e`, install the browser once:
`pnpm exec playwright install chromium`. The browser tests (in `e2e/`)
replace the GitHub API with a fake, so they need no token and no network.

`pnpm install` also installs a git pre-commit hook (`simple-git-hooks` and
`lint-staged`). It runs ESLint and Prettier on the staged files.

The editor settings in `.vscode/` format on save with Prettier. To make
`git blame` skip the commit that only reformatted the code, run
`git config blame.ignoreRevsFile .git-blame-ignore-revs` once.

`.github/workflows/ci.yml` runs the format check, lint, typecheck, the tests
with coverage, the build, and the browser tests on every push and pull
request. `.github/workflows/deploy.yml` runs the same checks first, and only
then builds the app and publishes `dist/` to GitHub Pages on every push to
`main` (see Step 3 above). Dependabot (`.github/dependabot.yml`) opens
update pull requests every week.

About two dependencies:

- **TypeScript** stays on 6.x until `vue-tsc` and `typescript-eslint`
  support TypeScript 7.
- **@types/node** stays on the major version that matches the Node version
  in `.nvmrc`.

To make sure that failing checks never reach `main`, protect the branch in
the app repository's **Settings → Branches**, and require the CI check to
pass.

**Dev-mode note:** the Content-Security-Policy (CSP) tag in `index.html`
(see "Security" below) is active in `pnpm dev` too. It blocks two things
that only happen during local development: Vite's own auto-reload
connection, and the favicon load over plain `http://`. You will see two
console warnings about this. They are expected. They do not appear in the
production build. Because auto-reload is blocked, refresh the page by hand
after you save a file. This is deliberate. The same strict CSP that
protects the live app also runs locally. The app does not relax it for
convenience.

## Architecture

The code is split into layers. Each layer uses only the layers above it in
this table.

| Folder                                      | What it holds                                                                                                                                 |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/`                               | The data model (`types.ts`), validated factories for the branded types, the commands (`applyCommand`), and the 3-way `merge`. No I/O.         |
| `src/format/`                               | `parse` and `serialize` for `learning.md`, and the commit messages.                                                                           |
| `src/github/`                               | The GitHub Contents API client. It returns a `Result`, never throws for an HTTP error, and checks the shape of every response.                |
| `src/store/`                                | Pinia stores. `board.ts` holds the board and runs every read and write; `settings.ts`, `theme.ts`, `tagFilter.ts`, and `search.ts` are small. |
| `src/composables/`                          | `useSyncLifecycle`: connects the board store to page events (tab hidden, page closing, back online, other tabs).                              |
| `src/components/`                           | The Vue components.                                                                                                                           |
| `src/markdown/`, `src/search/`, `src/tags/` | Markdown rendering, search matching and highlighting, tag helpers.                                                                            |

Two patterns are used everywhere:

- **Branded types.** A value such as `Headline` or `ItemId` is a `string`
  with a type-only brand. The only way to get one is a factory in
  `src/domain/factories.ts`, which validates the value. So a `Headline` is
  always valid.
- **`Result` instead of exceptions.** Functions that can fail return
  `{ ok: true, value }` or `{ ok: false, error }` (`src/domain/result.ts`).
  The error types are unions, and a `switch` over them is checked for
  completeness by ESLint.

The write path:

```
UI event
  → boardStore.applyAndSync(command)
      applyCommand(board, command)            the board changes at once
      the command is added to pendingCommands
  → debounce (800 ms quiet, at most 5 s or 10 commands)
  → queue: flushPending()
      pendingCommands → inFlightCommands
      serialize → parse again → compare       the round-trip check
      putFile(text, sha)
        ok        → confirmed board = written board
        409       → getFile → merge(base, ours, theirs) → putFile again
        temporary → keep the commands, retry later
        permanent → drop the in-flight commands
  → rebaseLocal: board = confirmed board + pendingCommands
```

The board that you see is always the confirmed board (what GitHub has at
`sha`) plus the commands that are not saved yet. When the confirmed board
changes, the store applies those commands again on top of it. So a change
you make while a request is in flight is never lost.

To add a new command:

1. Add it to the `Command` type and handle it in `applyCommand`
   (`src/domain/commands.ts`). If it creates something new with a random
   id, let the command carry the id (like `add`), so that applying it again
   gives the same result.
2. Add its commit message in `src/format/commitMessage.ts`.
3. Check that `merge` (`src/domain/merge.ts`) handles the change it makes.
   If it changes the file format, update `parse`, `serialize`, and the
   format description below.
4. Add tests in `tests/domain/`, `tests/format/`, and, for the UI,
   `tests/components/`.
5. Call `boardStore.applyAndSync(...)` from the component.

The analysis and plans behind the larger changes are in `doc/`.

## The `learning.md` file format

You can open and edit `learning.md` by hand on github.com. But the app's
parser is strict. If a line does not match the expected format, the app
shows a parse error. It will not guess what you meant. This protects your
data: a typo should cause a clear error, not silent data loss.

```
file        := header tagdef* blank* section('New') section('WIP') section('Complete') section('Discarded')
header      := '# Learning' NL blank* '<!-- learning-tracker: v1 — …' NL blank*
tagdef      := '<!-- tag:' NAME ' color:#' HEX6 ' -->' NL blank*
section(S)  := '## ' S NL blank* item*
item        := '### ' headline NL
               '<!-- ' meta (' ' meta)* ' -->' NL
               desc?
               blank*
meta        := 'id:' ULID | 'created:' TIMESTAMP | 'completed:' TIMESTAMP | 'discarded:' TIMESTAMP
             | 'tags:' NAME (',' NAME)*
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
- A tag `NAME` is letters, digits, `_`, or `-`, 1 to 32 characters (Unicode
  letters and digits are allowed, so `Übung` and `日本語` are valid names).
  No spaces, commas, or `<!--`.
- Every tag listed in a topic's `tags:` must be defined by a `tagdef` line
  above the first section. A tag name that is not defined is an error, not
  a silent drop — this keeps a hand-typed tag from being lost by accident.
- A file with no `tagdef` lines and no `tags:` parts is still a valid file:
  this is exactly what every file looked like before tags existed, and
  every such topic is read as having no tags.

Before every save, the app reads back what it is about to write and
compares it with its own in-memory data. If the two do not match exactly,
the app stops and saves nothing. This check runs on every save (also on
the last, best-effort save when the page closes, and on a merged save), and a
dedicated test (`tests/format/roundtrip.property.test.ts`) checks it against
10,000 generated examples, including deliberately awkward ones (headings,
code fences, and Unicode text inside descriptions).

The file can fail to parse. A hand-edit mistake is one common cause. When
this happens, the app shows the error with a line number. It links to the
file on github.com. It blocks all further writes until you fix the file.
Your last good version is always in the repository's git history.

Two more limits:

- The file must be UTF-8 text. If it is not (for example, after it was
  saved as Latin-1 by hand), the app shows an error and blocks all writes.
  It does not replace the characters it cannot read, because the next save
  would then destroy them.
- The file can be at most 1 MB. The GitHub Contents API does not return the
  content of larger files. The app then shows an error.

## Saving and conflicts

The app does not send one commit per click. It waits about a second after
your last change, then writes everything from that burst as one commit. A
long burst of changes, or ten changes in a row, forces a write sooner, so
nothing waits too long. While a write is pending or in progress, the bottom
corner shows "Unsaved changes…" or "Saving…". You can keep working while a
write runs: changes you make in the meantime are kept and go into the next
commit.

When you switch to another tab, the app writes pending changes right away.
When the page closes, it sends them one last time, as a best effort (only
if they fit into the 64 KB that browsers allow for this kind of request).
If you try to close the tab (or reload it) while something is not saved
yet, the browser asks you to confirm. This also applies while the settings
page is open, while the conflict dialog is open, and while you have typed
into a field of the detail view that was not saved yet.

If a save fails for a reason that can pass (no network, a GitHub server
error, a rate limit), your changes stay on the board. The corner shows
"Not saved — will retry", and the app tries again after 2, 5, 15, and then
every 60 seconds, and at once when the browser is back online. A long rate
limit shows the time of the next try. Only an error that cannot pass (for
example, the branch does not exist) undoes the changes of that save.

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
  you pick which one to keep — the other is discarded. **Keep GitHub's
  version** reads the file again, so you always get the newest version.
  Changes you make while the dialog is open wait, and are saved after your
  choice.

Refreshing the page, or switching back to the tab after a while, re-reads
`learning.md` from GitHub. This is skipped while changes are not saved yet
and while the conflict dialog is open, so a refresh never throws away your
work. If a change no longer fits the newest version (for example, you
renamed a topic that was deleted on GitHub), the app drops it and tells you.

If the app is open in several tabs of the same browser, a tab that saves
tells the other tabs, and they read the new version.

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
- The token is remembered in the browser's `localStorage`, so it survives
  a reload. Someone can steal your token from a device. If that happens,
  they get read and write access to one file, in one private repository.
  They get nothing else. Use the narrow permissions from Step 2.
- If the browser does not let the app use `localStorage` (some private
  modes do this), the app still starts. It keeps the token in memory only
  and tells you; you then enter it again after a reload.
