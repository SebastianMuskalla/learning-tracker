# Learning Tracker — Architecture & Implementation Plan

## 1. Feasibility verdict

**Yes, the plan is implementable and deployable — with one adjustment to the authentication requirement.**

| Requirement | Feasible? | How |
|---|---|---|
| Vue 3 + TypeScript, strictest typing | ✅ | Vite + `vue-tsc` + `tsconfig` with every strictness flag on, `typescript-eslint` `strictTypeChecked`, discriminated unions for item state |
| Four-state item model with automatic New ⇄ WIP | ✅ | Pure state-transition functions; state is *derived* from data, not stored independently |
| Drag-and-drop reordering per section | ✅ | `vue-draggable-plus` (Sortable.js wrapper, typed, Vue 3) |
| Storage: single markdown file, four `##` headlines | ✅ | Strict, line-based grammar with explicit description delimiters; see §5 |
| File managed in git, one commit per action | ✅ | GitHub Contents API: every `PUT` creates exactly one commit with a semantic message |
| Consistency safeguards (headings in descriptions etc.) | ✅ | Delimited description blocks, strict parser, round-trip verification before every write, property-based tests |
| Hosted on GitHub Pages | ✅ | Static build deployed via GitHub Actions |
| **Site accessible only via your GitHub account** | ⚠️ **Not directly** | GitHub Pages access control exists only on **GitHub Enterprise Cloud**. On Free/Pro plans every Pages site is public. See below for the workaround that gives you the *effective* security you want. |

### The one catch: authentication on GitHub Pages

- GitHub Pages cannot gate a site behind a GitHub login outside Enterprise Cloud.
- GitHub OAuth from a *pure static site* is not possible either: the web flow needs a client secret (requires a backend), and the device-flow endpoints do not send CORS headers (browser calls are blocked).
- A tiny token-exchange proxy (e.g. Cloudflare Worker) would enable OAuth, but it is another service your company's policies may block, and another thing to maintain.

**Recommended solution — "public shell, private data":**

1. The **app** is a static site with *zero data* in it. It does not matter that the page is publicly reachable; it is just code.
2. The **data** (`learning.md`) lives in a **private repository**.
3. The app talks to the private repo through the GitHub REST API using a **fine-grained Personal Access Token** scoped to *that one repository* with *Contents: read/write* only. The token is entered once per browser and stored locally.

Result: nobody but you can read or write the data, which is the actual goal. This is exactly the "or another type of authentication like a PAT" option you mentioned.

### Prerequisites to verify on the work laptop (Day 0)

These are the only things that can sink the plan, and they take five minutes to check from a browser on the work laptop:

1. `https://<you>.github.io/` (any Pages site) loads.
2. `https://api.github.com/` returns JSON (the API host is separate from `github.com`; some corporate proxies block one but not the other).
3. The corporate proxy does not strip `Access-Control-Allow-Origin` headers (verified for real by the Phase 0 spike below).
4. Company policy allows using a personal GitHub PAT from a work device (a policy question, not a technical one).

---

## 2. Key design decisions

| Decision | Choice | Rationale |
|---|---|---|
| Hosting | GitHub Pages, deployed by GitHub Actions | Only host reachable from both machines |
| Repos | **Two repos**: `learning-tracker` (public, app + Pages) and `learning-data` (private, `learning.md`) | Free plan allows Pages only on public repos; data must be private. Clean separation; the app is generic and configurable. (With GitHub Pro the app repo may be private too — the site is still public, but the source is not.) |
| Auth | Fine-grained PAT, one repo, Contents R/W, ≤ 1 year expiry | Only browser-feasible option without a backend |
| Token storage | `localStorage` by default; "session only" option (`sessionStorage`) for the work laptop; optional passphrase encryption (WebCrypto AES-GCM) | Balance between convenience and exposure on a managed device |
| Backend | None | Everything runs in the browser against `api.github.com` |
| Git write model | GitHub Contents API `PUT /repos/{o}/{r}/contents/{path}` with `sha` | One call = one commit; `sha` gives optimistic concurrency for free |
| State representation | State **derived** from data (`status` + presence of description) | Impossible to have a "New" item with a description — the type system forbids it |
| File format | `##` sections, `###` per item, metadata + description in HTML comments (§5) | Human-readable on GitHub, invisible delimiters, lossless round trip |
| Parser | Hand-written, strict, line-based | Grammar is tiny; a full CommonMark parser is unnecessary and would make strictness harder |

---

## 3. Technology stack

| Layer | Technology | Notes |
|---|---|---|
| Language | TypeScript (current stable, ≥ 5.x) | Strictest config, see §9 |
| Framework | Vue 3, `<script setup lang="ts">`, Composition API | |
| Build | Vite + `@vitejs/plugin-vue` | `base: '/learning-tracker/'` for Pages |
| Type checking | `vue-tsc --noEmit` in CI | Type-checks templates too |
| Lint / format | ESLint (`typescript-eslint` `strictTypeChecked` + `stylisticTypeChecked`, `eslint-plugin-vue` flat/recommended), Prettier | |
| State | Pinia (two small stores) | Typed, devtools, small |
| Drag & drop | `vue-draggable-plus` | Sortable.js under the hood, good TS types, Vue 3 native |
| Markdown rendering | `markdown-it` + `DOMPurify` | Sanitisation is mandatory: the PAT lives in the same origin |
| Code highlighting | `highlight.js` (lazy-loaded, common languages only) | Optional; descriptions will contain code blocks |
| Description editor | `<textarea>` with live preview toggle | Keep it simple; CodeMirror 6 can be swapped in later |
| GitHub API | Thin `fetch` wrapper (2 endpoints) with hand-written response types | Avoid pulling in Octokit for two calls |
| IDs | ULID (`ulidx`) | Sortable, URL-safe, no collision worry across devices |
| Testing | Vitest + `fast-check` (property-based) + `@vue/test-utils` | Round-trip property test is the main safeguard |
| Package manager | pnpm | |
| Node | 22 LTS | |
| CI/CD | GitHub Actions: `lint → typecheck → test → build → actions/deploy-pages` | |

---

## 4. Domain model

### 4.1 Types (illustrative — the actual code lives in `src/domain/`)

```ts
// Branded primitives — constructed only through validated factories
type ItemId      = string & { readonly __brand: 'ItemId' };       // ULID
type Headline    = string & { readonly __brand: 'Headline' };     // non-empty, single line, no "<!--"
type Description = string & { readonly __brand: 'Description' };  // non-empty after trim, LF-normalised, no end marker
type IsoDate     = string & { readonly __brand: 'IsoDate' };      // YYYY-MM-DD

interface ItemBase {
  readonly id: ItemId;
  readonly headline: Headline;
  readonly createdAt: IsoDate;
}

type ActiveItem = ItemBase & {
  readonly status: 'active';
  readonly description: Description | null;      // null → "New", non-null → "WIP"
};

type CompleteItem = ItemBase & {
  readonly status: 'complete';
  readonly description: Description;             // never null — enforced by the type
  readonly completedAt: IsoDate;
};

type DiscardedItem = ItemBase & {
  readonly status: 'discarded';
  readonly description: Description | null;
  readonly discardedAt: IsoDate;
};

type Item = ActiveItem | CompleteItem | DiscardedItem;

// The four sections of the file. Order of arrays == display order == file order.
type Section = 'new' | 'wip' | 'complete' | 'discarded';

interface Board {
  readonly new: readonly ActiveItem[];        // all have description === null
  readonly wip: readonly ActiveItem[];        // all have description !== null
  readonly complete: readonly CompleteItem[];
  readonly discarded: readonly DiscardedItem[];
}
```

`sectionOf(item)` is a pure function; `Board` is the only place where sections are materialised, and its invariants are checked by `validateBoard()` after every parse and before every serialize.

### 4.2 State machine

```
              add(headline)
                   │
                   ▼
   ┌────────── [ New ] ◄───────────────────────────┐
   │              │ setDescription(non-empty)       │ setDescription(empty)
   │              ▼                                 │
   │           [ WIP ] ──────────────────────────────┘
   │              │ complete()             ▲
   │              ▼                        │ uncomplete()
   │         [ Complete ] ─────────────────┘
   │              │
   │ discard()    │ discard()
   ▼              ▼
   [ Discarded ] ──── restore() ──► New or WIP (depending on description)
```

Rules (each is a pure function `(board, command) → Result<Board, DomainError>`):

| Command | Precondition | Effect |
|---|---|---|
| `add(headline)` | headline valid | New `ActiveItem` prepended to **New** |
| `editHeadline(id, headline)` | headline valid | In place |
| `setDescription(id, text)` | for **Complete** items: text must be non-empty (otherwise `DomainError.CompleteRequiresDescription`) | Active: item moves between New/WIP automatically (prepended to the target section when the section changes; stays in place otherwise). Complete/Discarded: in place |
| `complete(id)` | item is Active **and** has description | Prepended to **Complete**, `completedAt = today` |
| `uncomplete(id)` | item is Complete | Prepended to **WIP** |
| `discard(id)` | any non-discarded item | Prepended to **Discarded**, `discardedAt = today`; `completedAt` dropped |
| `restore(id)` | item is Discarded | Prepended to **New** or **WIP** depending on description |
| `reorder(section, fromIndex, toIndex)` | indices in range | Moves within one section only (cross-section drops are rejected by the UI) |
| `delete(id)` (v2, optional) | item is Discarded | Permanently removed — confirmation dialog |

"Prepend on section change" = most recent activity on top. Trivial to change to append.

---

## 5. File format (`learning.md`)

### 5.1 Goals

1. Readable and nicely rendered when opened on github.com.
2. **Lossless** round trip: `parse(serialize(board))` deep-equals `board` for *any* board, including descriptions that contain `#`, `##`, `###`, code fences, HTML, blank lines, etc.
3. Structural tokens cannot be produced accidentally by description content.
4. Strict: anything the app did not write is a parse error, never silently reinterpreted (protects against hand-edit mistakes destroying data).

### 5.2 Example

````markdown
# Learning

<!-- learning-tracker: v1 — edit by hand at your own risk; the app validates strictly -->

## New

### Kubernetes operators
<!-- id:01J8X3H5C0000000000000001 created:2026-09-15 -->

### Rust ownership model
<!-- id:01J8X3H5C0000000000000002 created:2026-09-15 -->

## WIP

### Event sourcing
<!-- id:01J8X3H5C0000000000000003 created:2026-09-10 -->
<!-- desc -->
## Notes
Anything goes in here, including `##` headings and fences:

```ts
const x: number = 1;
```
<!-- /desc -->

## Complete

### TypeScript branded types
<!-- id:01J8X3H5C0000000000000004 created:2026-09-01 completed:2026-09-12 -->
<!-- desc -->
See https://example.com/branded-types
<!-- /desc -->

## Discarded

### Learn COBOL
<!-- id:01J8X3H5C0000000000000005 created:2026-08-20 discarded:2026-09-02 -->
````

The HTML comments are invisible in GitHub's rendered view, so the file reads as a clean outline.

### 5.3 Grammar

```
file        := header section('New') section('WIP') section('Complete') section('Discarded')
header      := '# ' text NL  blank*  '<!-- learning-tracker: v1' text? ' -->' NL blank*
section(S)  := '## ' S NL blank* item*
item        := '### ' headline NL
               '<!-- ' meta (' ' meta)* ' -->' NL
               desc?
               blank*
meta        := 'id:' ULID | 'created:' DATE | 'completed:' DATE | 'discarded:' DATE
desc        := '<!-- desc -->' NL  rawline*  '<!-- /desc -->' NL
rawline     := any line that is not exactly '<!-- /desc -->'
blank       := empty line (outside desc blocks only)
```

Parser behaviour:

- Line-based, two modes: **structural** (outside `desc`) and **raw** (inside `desc`).
- In raw mode *nothing* is interpreted except the exact end marker `<!-- /desc -->`. Headings, fences, comments — all raw.
- In structural mode every non-blank line must match one of the productions, otherwise `ParseError { line, reason }`. No recovery, no guessing.
- Section order is fixed; missing/duplicate/unknown sections → error.
- Semantic validation after parsing:
  - Item under `## New` with a `desc` block, or under `## WIP` without one → **warning** (not error); the item is placed in the correct section and the file is normalised on the next write.
  - Item under `## Complete` without `desc` or without `completed:` → error (data would be lost by normalising).
  - Duplicate `id` → error.
  - `desc` content is stored with leading/trailing blank lines stripped; if empty after stripping → treated as no description.
- Line endings: always `\n` on write; `\r\n` accepted on read (normalised).

### 5.4 Safeguards (the "consistency measures" you asked for)

| Threat | Safeguard |
|---|---|
| Heading (`#`, `##`, `###`) inside a description | Description lives inside a `<!-- desc -->…<!-- /desc -->` block that the parser reads in raw mode; headings are data, not structure |
| Description contains the literal end marker `<!-- /desc -->` | Rejected at input validation with a clear message (the only reserved string). Also enforced by the `Description` factory |
| Headline contains `\n` or `<!--` | Rejected by the `Headline` factory; the UI uses a single-line input |
| App writes something it cannot read back | **Round-trip gate**: before every commit, `serialize(board)` is parsed again and deep-compared to `board`. Mismatch → write aborted, error shown, nothing committed |
| Hand edit on github.com breaks the file | Strict parser refuses to load → app shows the parse error with line number and **refuses all writes** until the file is fixed (fix it in the GitHub editor; git history has the last good version) |
| Two devices edit concurrently | Contents API rejects a `PUT` with a stale `sha` (409/422). App re-fetches, re-applies the *command* (not the diff) onto the fresh board, retries once; on second failure it shows both versions |
| Partial/corrupted write | Impossible by construction: the Contents API commit is atomic; the whole file is always rewritten from the model |
| Format evolution | `learning-tracker: v1` header; parser dispatches on version, migrations are explicit functions |
| Accidental data loss via app bug | Every write is a commit → `git revert` / view history on github.com |
| Regression in parser/serializer | Property-based test: `fc.property(arbitraryBoard(), b => deepEqual(parse(serialize(b)), b))` with generators that produce evil descriptions (markers-in-code-blocks, heading-only text, unicode, CRLF, trailing whitespace) |

---

## 6. Sync layer (GitHub Contents API)

```
┌──────────────┐  command   ┌──────────────┐  Board    ┌─────────────┐  text+sha  ┌────────────┐
│  Vue UI      │ ─────────► │ Pinia store  │ ────────► │ Serializer  │ ─────────► │ GitHub API │
│  (components)│ ◄───────── │ (board, sync │ ◄──────── │ / Parser    │ ◄───────── │ client     │
└──────────────┘  reactive  │  status)     │  Board    └─────────────┘  text+sha  └────────────┘
                            └──────────────┘
```

**Read** — `GET /repos/{owner}/{repo}/contents/{path}?ref={branch}`
- Returns base64 content + `sha`. Decode with `TextDecoder('utf-8')` (files < 1 MB; a learning log will never approach this).
- 404 on first run → offer to create an empty `learning.md` (all four sections, no items).
- Re-fetched on: app load, window `focus` / `visibilitychange`, manual refresh button, and after any conflict.

**Write** — `PUT /repos/{owner}/{repo}/contents/{path}` with `{ message, content (base64), sha, branch }`
- Exactly one commit per user action.
- Commit message convention (imperative, item headline quoted):
  - `Add "Rust ownership model"`
  - `Describe "Rust ownership model"` (description created/changed)
  - `Rename "Old" → "New"`
  - `Complete "Rust ownership model"`
  - `Reopen "Rust ownership model"`
  - `Discard "Learn COBOL"`
  - `Restore "Learn COBOL"`
  - `Reorder WIP`
  - `Initialize learning.md`
- Commit author/committer default to the PAT owner; no extra config needed.

**Write pipeline** (in the store):

```
1. nextBoard = applyCommand(board, cmd)            // pure, may return DomainError → show, stop
2. text      = serialize(nextBoard)
3. assert deepEqual(parse(text), nextBoard)         // round-trip gate
4. optimistic: board = nextBoard, syncStatus = 'saving'
5. PUT with current sha
   ├─ 200 → sha = response.content.sha, syncStatus = 'saved'
   ├─ 409/422 (stale sha) → GET fresh; board' = applyCommand(fresh, cmd); goto 2 (max 1 retry)
   └─ other error → board = previous, syncStatus = 'error', toast with retry
```

Commands are serialised through a single async queue so rapid actions (e.g. several drags) never race each other. Drag reorder is **debounced** (~1 s after the last drop) so a burst of reorders produces one `Reorder <Section>` commit — this is the only deliberate exception to "one action, one commit"; it can be disabled in settings.

Rate limits: 5 000 requests/hour authenticated — irrelevant at this scale.

---

## 7. Authentication & secret handling

- **Token type**: fine-grained PAT. Resource owner: you. Repository access: *only* `learning-data`. Permissions: *Contents → Read and write*. Everything else "No access". Expiry: max allowed (1 year); the app shows a warning when the token returns 401.
- **Setup screen** (first visit / after 401): fields for owner, repo, branch (`main`), path (`learning.md`), token, storage mode. "Test connection" button does a `GET` and shows the result. Settings are stored in `localStorage` under one key; the token is stored separately.
- **Storage modes**:
  1. *Remember on this device* — `localStorage` (private PC).
  2. *This session only* — `sessionStorage` (work laptop; re-paste token after browser restart; a password manager makes this painless).
  3. *Encrypted with passphrase* — token encrypted with AES-GCM, key derived via PBKDF2 (WebCrypto), stored in `localStorage`; passphrase prompted once per session. Nice-to-have, Phase 6.
- **XSS hardening** (a stolen token = write access to one private repo, so this matters):
  - `DOMPurify` on all rendered markdown; `markdown-it` with `html: false` (no raw HTML pass-through at all — simpler and safer; can be relaxed later).
  - `<meta http-equiv="Content-Security-Policy">` in `index.html`: `default-src 'self'; connect-src https://api.github.com; img-src https: data:; style-src 'self' 'unsafe-inline'; script-src 'self'` (Vite build output is CSP-clean apart from inline styles).
  - No third-party scripts, no analytics.
  - Links in descriptions rendered with `rel="noopener noreferrer" target="_blank"`.
- **Never** put the token in the URL, in the app repo, or in commit content.
- Token is **never sent anywhere except** `https://api.github.com` — enforced by CSP `connect-src`.

---

## 8. UI structure

Single page, no router needed (a `?item=<id>` query param for deep links is a cheap v2).

```
App.vue
├── SetupView.vue            first run / no token / 401 — config form + "test connection"
└── BoardView.vue
    ├── TopBar.vue           sync status (saved / saving / error / conflict), refresh, settings, "Add topic" input
    ├── ParseErrorBanner.vue shown when learning.md fails to parse; links to the file on github.com; blocks writes
    ├── SectionColumn.vue    ×4 (New, WIP, Complete, Discarded) — collapsible, item count, drag container
    │   └── ItemCard.vue     headline (inline-editable), state badge, actions (complete / discard / restore), drag handle
    └── ItemDetailDrawer.vue side panel: headline editor, description textarea ↔ rendered preview, dates, actions
```

Layout: on wide screens New/WIP side by side ("Active") with Complete and Discarded below (collapsed by default); on narrow screens everything stacks. Keyboard: `n` focuses "Add topic", `Esc` closes drawer, `Ctrl+S` saves description.

Drag & drop: each `SectionColumn` is its own `vue-draggable-plus` list with `group: <section name>` so items cannot be dropped into another section (state changes go through explicit actions to keep the domain rules honest). Drop emits `reorder(section, from, to)`.

Rendering: descriptions rendered lazily (only when the drawer is open); `highlight.js` languages loaded on demand.

---

## 9. Project layout & strict configuration

```
learning-tracker/
├── .github/workflows/
│   ├── ci.yml                 lint, typecheck, test on every push/PR
│   └── deploy.yml             build + actions/deploy-pages on main
├── public/
├── src/
│   ├── domain/                pure TS, zero Vue imports, 100 % unit-tested
│   │   ├── types.ts           branded types + Item/Board unions
│   │   ├── factories.ts       makeHeadline(), makeDescription(), … → Result<T, ValidationError>
│   │   ├── commands.ts        applyCommand(board, cmd) → Result<Board, DomainError>
│   │   ├── board.ts           sectionOf(), validateBoard(), emptyBoard()
│   │   └── result.ts          tiny Result<T, E> helper (or `neverthrow`)
│   ├── format/                pure TS
│   │   ├── parse.ts           text → Result<{ board, warnings }, ParseError>
│   │   ├── serialize.ts       board → text
│   │   └── commitMessage.ts   cmd → string
│   ├── github/
│   │   ├── client.ts          getFile(), putFile() — typed fetch wrapper, error mapping
│   │   └── types.ts           minimal response types
│   ├── store/
│   │   ├── board.ts           Pinia: board, sha, syncStatus, queue, applyAndSync(cmd)
│   │   └── settings.ts        Pinia: repo config + token storage modes
│   ├── components/            see §8
│   ├── markdown/render.ts     markdown-it + DOMPurify + lazy highlight.js
│   ├── App.vue
│   └── main.ts
├── tests/
│   ├── domain/*.test.ts
│   ├── format/roundtrip.property.test.ts
│   ├── format/fixtures/*.md   hand-written good & bad files
│   └── store/*.test.ts        with mocked client (conflict path!)
├── index.html                 includes CSP meta tag
├── eslint.config.js
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── vite.config.ts
└── package.json
```

`tsconfig.app.json` (the strictest practical set):

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "preserve",

    "strict": true,                              // noImplicitAny, strictNullChecks, strictFunctionTypes, strictBindCallApply,
                                                 // strictPropertyInitialization, noImplicitThis, useUnknownInCatchVariables, alwaysStrict
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "allowUnreachableCode": false,
    "allowUnusedLabels": false,
    "forceConsistentCasingInFileNames": true,

    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,                        // third-party .d.ts only; our code is fully checked
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "tests/**/*.ts"]
}
```

ESLint: `typescript-eslint` `strictTypeChecked` + `stylisticTypeChecked`, plus `@typescript-eslint/switch-exhaustiveness-check`, `no-restricted-syntax` to forbid `as` casts outside `factories.ts`, and `eslint-plugin-vue` `flat/recommended` with `vue/block-lang` enforcing `lang="ts"`. `vue-tsc` runs in CI so template expressions are type-checked with the same flags.

---

## 10. Implementation plan

Each phase ends in a working, committed state. Estimated effort assumes evenings/weekends; total roughly **4–6 focused days**.

### Phase 0 — Feasibility spike (½ day) — *do this first, on the work laptop*
- [ ] Create private repo `learning-data` with a hand-written `learning.md` from §5.2.
- [ ] Create fine-grained PAT (Contents R/W on that repo only).
- [ ] Create public repo `learning-tracker`; push a 20-line `index.html` that does `fetch('https://api.github.com/repos/…/contents/learning.md', { headers: { Authorization: 'Bearer …' } })` with a token from `prompt()` and prints the decoded content; enable Pages via Actions.
- [ ] Open the Pages URL **from the work laptop**: verify the read works and, with a second `PUT`, that a commit appears.
- **Exit criterion**: read + write succeed from both machines. If not, the blocker is network policy and the plan needs a different host — better to know now.

### Phase 1 — Project scaffold (½ day)
- [ ] `pnpm create vite` (vue-ts), replace tsconfigs with §9, add ESLint/Prettier, Vitest, `vue-tsc`.
- [ ] `ci.yml` (lint, typecheck, test) and `deploy.yml` (build → `actions/upload-pages-artifact` → `actions/deploy-pages`), `base` set in `vite.config.ts`.
- [ ] Deploy the empty scaffold to Pages.
- **Exit criterion**: green CI, "Hello" on the Pages URL, `pnpm typecheck` passes with all flags.

### Phase 2 — Domain model (1 day)
- [ ] `types.ts`, `result.ts`, `factories.ts` with validation (`Headline`, `Description`, `IsoDate`, `ItemId`).
- [ ] `commands.ts`: all commands from §4.2 as pure functions with exhaustive `switch` on `cmd.type` and on `item.status`.
- [ ] `board.ts`: `validateBoard()`, `sectionOf()`, `emptyBoard()`.
- [ ] Unit tests for every transition incl. every rejected precondition; property test: applying any sequence of random valid commands yields a board that passes `validateBoard()`.
- **Exit criterion**: 100 % branch coverage on `src/domain`, no `as` casts outside factories.

### Phase 3 — File format (1 day)
- [ ] `serialize.ts` per §5.3.
- [ ] `parse.ts`: strict line-based parser, `ParseError { line, reason }`, warnings for New/WIP mismatches.
- [ ] Fixtures: valid file, empty file, file with evil descriptions, and ~10 invalid files (missing section, unknown line, duplicate id, unterminated desc, complete without desc, CRLF).
- [ ] Property-based round-trip test with `fast-check`; generators must include: descriptions starting with `#`, containing `## New`, `### x`, `<!-- desc -->`, code fences, leading/trailing blank lines, tabs, unicode, 0-length.
- [ ] `commitMessage.ts`.
- **Exit criterion**: round-trip property holds for 10 000 runs; every fixture behaves as documented.

### Phase 4 — GitHub client & store (1 day)
- [ ] `github/client.ts`: `getFile()`, `putFile()`, error mapping (`Unauthorized`, `NotFound`, `Conflict`, `RateLimited`, `Network`), base64 ⇄ UTF-8 helpers.
- [ ] `store/settings.ts`: config + token with the three storage modes (passphrase mode may be stubbed).
- [ ] `store/board.ts`: load, `applyAndSync(cmd)` pipeline from §6 with serial queue, optimistic update, round-trip gate, conflict retry, reorder debounce.
- [ ] Tests with a mocked client: happy path, 401, 404 → initialise, 409 → rebase-and-retry succeeds, 409 twice → error surfaced, round-trip gate failure aborts write.
- **Exit criterion**: store tests green; manual smoke test against the real repo from the dev server.

### Phase 5 — UI (1–1½ days)
- [ ] `SetupView` with "test connection".
- [ ] `BoardView`, `TopBar` (add topic, sync status, refresh), four `SectionColumn`s with `vue-draggable-plus`, `ItemCard`.
- [ ] `ItemDetailDrawer` with textarea ↔ preview, `markdown/render.ts` (markdown-it + DOMPurify + lazy highlight.js).
- [ ] `ParseErrorBanner` blocking writes.
- [ ] CSP meta tag; verify no CSP violations in DevTools.
- [ ] Re-fetch on `visibilitychange`; keyboard shortcuts.
- [ ] Responsive layout; light/dark via `prefers-color-scheme`.
- **Exit criterion**: every command from §4.2 reachable in the UI, each producing one commit with the right message; usable on both machines.

### Phase 6 — Hardening & polish (½ day, ongoing)
- [ ] Passphrase-encrypted token mode.
- [ ] Token-expiry warning; "open file on GitHub" and "view history" links.
- [ ] Conflict UI showing both versions when the auto-rebase fails.
- [ ] Optional: permanent delete of discarded items, `?item=` deep links, export/download of `learning.md`, PWA manifest for an app-like window.
- [ ] `README.md` documenting the file grammar (copied from §5) so hand edits are safe.

---

## 11. Risks & open questions

| Risk / question | Impact | Mitigation |
|---|---|---|
| `api.github.com` blocked or CORS stripped on the work laptop | Fatal for the work-laptop use case | Phase 0 spike before writing any real code |
| Company policy forbids personal PATs / personal GitHub on work devices | Policy, not technical | Your call; the app is equally usable from the private PC only |
| Token theft from a managed work device | Attacker gets R/W to one private markdown file | Fine-grained token, single repo, expiry, session-only storage mode, CSP, no HTML in markdown |
| Public app repo exposes source | None (no data, no secrets) | Or GitHub Pro to make it private |
| Description contains `<!-- /desc -->` | Cannot be stored | Explicit validation message; realistically never happens |
| Hand edits on github.com break the grammar | App refuses to load | Strict error with line number + history in git; grammar documented in README |
| Contents API 1 MB limit | Would require the Git Data API | Not reachable with a learning log; the client can switch to the blobs API later without model changes |
| Four file sections vs. "three states" | `New` vs `WIP` is derived, so the file section is redundant | Parser tolerates and normalises mismatches (warning, not error) |

**Decisions made on your behalf (easy to change):**

1. Four UI sections mirroring the four file sections; "Active" is a visual grouping of New + WIP, not a fifth list. Reordering is within each of the four sections.
2. Items are **prepended** to a section when they enter it (newest activity on top).
3. A Complete item cannot have its description removed; the app rejects the edit instead of silently reopening the item.
4. Drag reorders are debounced into one commit per burst; everything else is one commit per action.
5. Raw HTML in descriptions is disabled (`markdown-it` `html: false`) for XSS safety.
6. Two repositories (public app, private data) rather than one.
