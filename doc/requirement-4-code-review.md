# Requirement 4: Code Review

This is a review of the full codebase, including the uncommitted work in
the working tree (the code-block labels in `src/markdown/render.ts`). It
lists each problem found and a step-by-step fix. No code was changed.

## 1. How the review was done

- Read every file in `src/`, `tests/`, `.github/`, the config files, the
  README, and the `doc/` requirement files.
- Ran every check that the project has:

  | Command              | Result                                           |
  | -------------------- | ------------------------------------------------ |
  | `pnpm lint`          | Pass (0 warnings)                                |
  | `pnpm typecheck`     | Pass                                             |
  | `pnpm test`          | Pass: 235 tests in 19 files, 36 s                |
  | `pnpm build`         | Pass                                             |
  | `prettier --check .` | **Fail: 30 files are not formatted**             |
  | `pnpm audit`         | No known vulnerabilities                         |
  | `pnpm outdated`      | 10 patch/minor updates, 2 major updates (see P4) |

- Wrote one throwaway test (outside the repository) to confirm finding C1.
  It failed, so the bug is confirmed. The test is in C1 below, so it can be
  added to the test suite.

## 2. What is already good

The codebase is in a good state overall. Most of the findings below are
edge cases around concurrency and gaps in tooling, not general quality
problems.

- The domain model is clean. It uses branded types that you can only
  create through validated factories, a `Result` type instead of
  exceptions, and pure command functions.
- A round-trip check runs before each normal write. It is backed by a
  property-based test with 10,000 generated examples.
- The file parser is strict and gives errors with line numbers.
- All writes go through one promise queue, and there is a real 3-way merge.
- TypeScript is strict (`exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, …). ESLint uses `strictTypeChecked` with
  `--max-warnings 0`.
- Security basics are covered: a strict CSP, `markdown-it` with
  `html: false`, and DOMPurify.
- The README is detailed and easy for end users to follow.

## 3. Summary

Severity: **Critical** = silent data loss in normal use. **High** = data
loss in edge cases, or a broken safety net. **Medium** = wrong behavior or
a clear gap. **Low** = improvement.

| ID  | Severity | Area           | Title                                                                            |
| --- | -------- | -------------- | -------------------------------------------------------------------------------- |
| C1  | Critical | Concurrency    | Edits made while a write is in flight are silently lost                          |
| C2  | High     | Concurrency    | The "tab hidden" flush runs outside the queue and ignores its result             |
| C3  | High     | Concurrency    | A refresh while the conflict dialog is open can revert remote changes            |
| C4  | Medium   | Concurrency    | No unload protection while the settings screen is open                           |
| C5  | Medium   | Concurrency    | Switching repositories keeps the old repository's state                          |
| C6  | Medium   | Concurrency    | Drawer drafts go stale and can overwrite newer data                              |
| C7  | Low      | Concurrency    | Unbounded rate-limit sleep blocks the queue; no multi-tab coordination           |
| E1  | High     | Error handling | A failed write throws away the user's changes, even for temporary errors         |
| E2  | Medium   | Error handling | Every 403 is treated as a rate limit; every 422 as a conflict                    |
| E3  | Medium   | Error handling | Old error messages stay visible after a successful save                          |
| E4  | Medium   | Error handling | GitHub responses are not validated; files over 1 MB fail with an unclear message |
| E5  | Medium   | Error handling | Invalid UTF-8 is replaced without warning and then written back                  |
| E6  | Medium   | Error handling | Bad or blocked `localStorage` stops the app from starting                        |
| E7  | Low      | Error handling | No global error handler; the lazy highlight.js import can fail after a deploy    |
| E8  | Low      | Error handling | Users see internal JSON in error messages                                        |
| D1  | Medium   | Documentation  | README statements that do not match the code                                     |
| D2  | Low      | Documentation  | No architecture overview for developers                                          |
| D3  | Low      | Documentation  | Unclear or wrong code comments                                                   |
| D4  | Low      | Documentation  | Requirement documents do not track their implementation status                   |
| T1  | Medium   | Strictness     | `tsconfig.node.json` is not strict                                               |
| T2  | Medium   | Strictness     | Vue templates are not type-checked strictly                                      |
| T3  | Low      | Strictness     | App code and test code share one tsconfig, and app code gets Node types          |
| T4  | Low      | Strictness     | Vue runtime warnings do not fail tests                                           |
| L1  | Low      | Linting        | Broad lint exemptions and missing lint rules                                     |
| F1  | High     | Formatting     | Formatting is not enforced; 30 files are not formatted                           |
| F2  | High     | Formatting     | `pnpm format` would break the parser test fixtures and change the lockfile       |
| F3  | Low      | Formatting     | Unused Prettier ESLint plugin; no `.editorconfig` or `.gitattributes`            |
| Q1  | High     | Tests          | The risky concurrency and error paths have no tests                              |
| Q2  | Medium   | Tests          | Few component tests; the GitHub client error mapping has no tests                |
| Q3  | Medium   | Tests          | No coverage measurement                                                          |
| Q4  | Low      | Tests          | All tests run in jsdom (92 % of the test time is jsdom setup)                    |
| Q5  | Low      | Tests          | No browser or end-to-end tests                                                   |
| P1  | High     | CI             | The deploy workflow does not wait for lint and tests                             |
| P2  | Medium   | Dependencies   | Node versions are inconsistent (CI 22, types 24, local 25)                       |
| P3  | Medium   | Dependencies   | Unused and redundant dependencies                                                |
| P4  | Low      | Dependencies   | Pending updates; no automated dependency updates                                 |
| P5  | Low      | CI             | CI hardening                                                                     |
| O1  | Medium   | Other          | Keyboard accessibility gaps                                                      |
| O2  | Low      | Other          | URL parts are not encoded                                                        |

---

## 4. Concurrency

### C1 (Critical): Edits made while a write is in flight are silently lost

**Problem.** `applyAndSync` applies every command to `board.value` at once.
But several places in `src/store/board.ts` later replace `board.value` with
a snapshot taken _before_ the write started:

- on success: `board.value = intendedBoard` ([board.ts:313](../src/store/board.ts#L313));
- on every error: `board.value = previousBoard` (lines 322, 332, 355, 370,
  378, 388, 399);
- on a merge: `board.value = merged.value` (line 406);
- on load: `board.value = parsed.value.board` (line 147).

When the user makes a change while a PUT or GET is in flight, that change
is in `board.value` and in `pendingMessages`. When the request finishes,
the snapshot overwrites it. Then the next flush serializes the (old) board,
finds `text === baseText`, and ends as "Saved" without writing anything.
The change is gone. There is no error and no commit.

This happens in normal use: the PUT takes a few hundred ms, and the
debounce means the user often keeps editing during it. It also happens on
the first load: you can add an item before `load()` finishes.

**Confirmed** with this test (it fails today: the final board holds only
`A`, and `putFile` was called once):

```ts
it('keeps an edit that was made while a PUT is in flight', async () => {
  vi.useFakeTimers();
  const { board } = setup();
  getFile.mockResolvedValue({ ok: true, value: { text: serialize(emptyBoard()), sha: 's1' } });
  await board.load();

  let release: (value: unknown) => void = () => {};
  putFile.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
  putFile.mockResolvedValue({ ok: true, value: { sha: 's3' } });

  void board.applyAndSync({ type: 'add', headline: unwrap(makeHeadline('A')) });
  await vi.advanceTimersByTimeAsync(900); // first PUT is now in flight
  void board.applyAndSync({ type: 'add', headline: unwrap(makeHeadline('B')) });
  release({ ok: true, value: { sha: 's2' } });
  await vi.advanceTimersByTimeAsync(2000);

  expect(board.board.new.map((i) => i.headline)).toEqual(['B', 'A']);
  expect(putFile).toHaveBeenCalledTimes(2);
});
```

**Fix.**

1. Store the pending **commands**, not only their messages:
   `pendingCommands: Command[]`. Build the commit message from them when
   flushing.
2. Split the state in two: `confirmedBoard` (what GitHub has, together
   with `sha` and `baseText`) and `board` (what the user sees:
   `confirmedBoard` plus the pending commands).
3. Add one helper, `rebaseLocal(newConfirmed: Board)`. It sets
   `confirmedBoard`, then computes
   `board = pendingCommands.reduce(applyCommand, newConfirmed)`. If a
   command no longer applies (for example, its item was deleted remotely),
   drop it and add a warning.
4. Replace every `board.value = …` in `performLoad`, `syncAttempt`,
   `reconcileConflict`, `writeBoard`, and `resolveConflict` with
   `rebaseLocal(…)`. On success, rebase onto the written board. On a
   permanent error, rebase onto the last confirmed board (see E1). On a
   merge, rebase onto the merged board.
5. In `flushPending`, take the commands out of `pendingCommands` when the
   write _starts_. Keep them in an `inFlightCommands` list until it ends.
   On a permanent failure, put them back at the front of `pendingCommands`
   so that nothing is lost.
6. Add the test above, plus variants for: an edit during a failing PUT, an
   edit during a 409 and merge, and an edit during `load()`.

### C2 (High): The "tab hidden" flush runs outside the queue and ignores its result

**Problem.** `onVisibilityChange` calls `flushBeforeUnload()` every time
the tab becomes hidden ([BoardView.vue:94-104](../src/components/BoardView.vue#L94-L104)).
This happens on every tab switch, not only when the tab closes.
`flushBeforeUnload` ([board.ts:250-270](../src/store/board.ts#L250-L270))
has several problems:

1. It does not use the queue. If a queued write is in flight, both PUTs
   use the same `sha`. One of them gets a 409. If the keepalive PUT is the
   one that loses, its changes are silently lost, because its result is
   never read.
2. It never updates `sha` or `baseText` when it succeeds. The next write
   from this tab always gets a 409 and has to go through the merge path.
3. It sets `syncStatus = 'saving'`, and nothing ever sets it back. So
   `hasUnsavedWork` stays `true` and the "Saving…" badge stays until the
   next load.
4. When the tab becomes visible again, `refresh()` runs right away. It
   can read the file before the keepalive PUT has landed. The board then
   goes back to the old version.
5. It skips the round-trip gate, even though the README says the gate
   runs on every save (see D1).
6. Browsers limit the body of `keepalive` requests to 64 KiB. Once
   `learning.md` is about 48 KB (base64 adds a third), `fetch` rejects the
   request. The rejection is swallowed by `void`, so the best-effort flush
   silently stops working.

**Fix.**

1. On `visibilitychange` → `hidden`, call `boardStore.flushNow()`. This
   uses the normal queue, retry, and merge path. Browsers keep running
   network requests for a hidden tab.
2. Use `flushBeforeUnload()` only on `pagehide`, when the page really
   goes away.
3. In `flushBeforeUnload`, run the same round-trip gate as `writeBoard`.
   Skip the request if the encoded body is larger than 60 KiB. The
   `beforeunload` prompt is the backstop in that case.
4. In `flushBeforeUnload`, do not set `syncStatus`. Keep the pending state
   as it is. The page is unloading anyway, and if it comes back from the
   back/forward cache, the state is still correct.
5. Handle `pageshow` with `event.persisted === true` (the page came back
   from the back/forward cache) by calling `refresh()`.
6. Add tests: hidden → flush goes through the queue; `pagehide` → keepalive
   PUT only when the body is small enough.

### C3 (High): A refresh while the conflict dialog is open can revert remote changes

**Problem.** `refresh()` ([board.ts:115-120](../src/store/board.ts#L115-L120))
only checks `pendingMessages`. While the conflict dialog is open, switching
tabs triggers `refresh()`. That call replaces `board`, `sha`, and
`baseText` with the newest remote version. If the user then picks
**Keep GitHub's version**, `resolveConflict` sets
`board = conflict.remote` ([board.ts:426-429](../src/store/board.ts#L426-L429)).
That is the _older_ remote, but `sha` is now the _newer_ one. The next edit
writes the older board with the newer sha. GitHub accepts it, and every
remote change made after the conflict is silently reverted.

`doc/requirement-1-concurrency.md` already lists this case as C7, but the
implementation does not handle it.

**Fix.**

1. In `refresh()`, also skip when `conflict.value !== null`, and when a
   write is in flight.
2. Store `sha` and `baseText` inside the `conflict` object when the
   conflict is raised. `resolveConflict` should use those values, not the
   global ones.
3. Better: in `keepTheirs`, call `performLoad()` inside the queued job
   instead of trusting the stored remote board. It costs one GET and is
   always correct.
4. Add a test: conflict → refresh → keepTheirs → next write must not
   revert the newer remote change.

### C4 (Medium): No unload protection while the settings screen is open

**Problem.** `App.vue` shows either `SetupView` or `BoardView`. The
`beforeunload`, `pagehide`, and `visibilitychange` listeners are registered
in `BoardView` only. Tags are created, recolored, and deleted on the
**settings screen**, so their commands are pending while `BoardView` is
unmounted. If the user closes the tab within the debounce window, there is
no prompt and no flush. The change is lost.

`hasUnsavedWork` also ignores two more cases: the `conflict` state (the
local version exists only in memory) and unsaved drawer drafts (C6).

**Fix.**

1. Move the listeners into a composable, for example
   `useUnloadProtection()`. Call it once in `App.vue` so that it is always
   active.
2. Make `hasUnsavedWork` true for `pending`, `saving`, `conflict`, and
   while an editor has a dirty draft (for example, a counter of dirty
   editors in the store).
3. Add a component test for `App.vue`: settings screen open, pending work
   → `beforeunload` calls `preventDefault()`.

### C5 (Medium): Switching repositories keeps the old repository's state

**Problem.** `SetupView.save()` flushes and then changes owner, repo,
branch, or path ([SetupView.vue:177](../src/components/SetupView.vue#L177)).
The board store keeps `board`, `sha`, `baseText`, `conflict`, `parseError`,
and `warnings` from the old repository. Two things can go wrong:

- If the first load from the new repository fails (network, 401), the
  board keeps showing the old repository's items. The user can edit them,
  and the edits are sent to the new repository with the old sha.
- If the flush ended in a conflict, the conflict dialog appears for the
  new repository. **Keep my version** then writes into the new
  repository.

**Fix.**

1. Add a `reset()` action to the board store. It clears all state and
   cancels the timers.
2. In `SetupView.save()`, compare the old and new repository settings. If
   they differ, first `await flushNow()`. Then check the result: if it
   ended in `error` or `conflict`, tell the user and do not switch. Only
   after a clean flush, call `reset()` and then save the new settings.
3. Add a test for this flow.

### C6 (Medium): Drawer drafts go stale and can overwrite newer data

**Problem.** In `ItemDetailDrawer.vue`, `headlineDraft` and
`descriptionDraft` are reset only when `item.id` changes (lines 81-91).
If a merge or refresh changes the open item's description, the textarea
still shows the old text. The next blur saves that old text over the
newer one. This is a normal local edit, so no conflict is detected.

Also:

- `saveDescription` emits on every blur, even when nothing changed. The
  command applies without error, so a line like `Describe "X"` is added to
  the batch commit message even though nothing changed.
- A draft is saved only on blur, Ctrl+S, or **Send**. If the user presses
  Escape or closes the tab while typing, the draft may be lost.
  (Browsers do not reliably fire `blur` when a focused element is
  removed. This needs a check in a real browser.)

**Fix.**

1. Keep a `dirty` flag per draft (`draft !== item.value`).
2. Watch `item.headline` and `item.description`. If the draft is not
   dirty, copy the new value into it. If it is dirty and the stored value
   changed, show a short notice ("This description changed on GitHub")
   with **Use theirs** and **Keep mine** buttons.
3. Emit `setDescription` only if the normalized draft differs from
   `item.description`.
4. On close (Escape, X button, selecting another item) and in
   `onBeforeUnmount`, save a dirty draft first.
5. Report dirty drafts to `hasUnsavedWork` (C4).

### C7 (Low): Unbounded rate-limit sleep blocks the queue; no multi-tab coordination

**Problem.**

- `syncAttempt` sleeps for `Retry-After` seconds _inside_ the queue
  ([board.ts:326](../src/store/board.ts#L326)). GitHub can send several
  minutes there. During the sleep, every load, flush, and conflict choice
  waits, and the UI only shows "Saving…".
- Phase 5 of `doc/requirement-1-concurrency.md` (multi-tab coordination)
  is not implemented. Two tabs of the app in the same browser fight over
  the same file. The merge mostly handles this, but it wastes requests and
  can show the conflict dialog.

**Fix.**

1. Cap the wait (for example, 30 s). If the requested wait is longer, stop
   and set `syncStatus = 'error'`, keep the pending work (E1), and show
   "Rate limited until HH:MM". Retry on a timer outside the queue.
2. Optional: use a `BroadcastChannel('learning-tracker')`. After each
   successful write, send the new `sha` so that other tabs `refresh()`.
   Alternatively, use the Web Locks API
   (`navigator.locks.request('learning-tracker-write', …)`) so that only
   one tab writes at a time.

---

## 5. Error handling

### E1 (High): A failed write throws away the user's changes, even for temporary errors

**Problem.** When a write fails with a network error, a 5xx, a 401, or a
403, `syncAttempt` rolls back to `previousBoard`
([board.ts:331-335](../src/store/board.ts#L331-L335)). Only rate limits
and conflicts are retried. A short Wi-Fi drop therefore throws away every
change in the batch. The user sees "Network error" and their edits
disappear from the board. Nothing is left to retry.

**Fix.**

1. Split errors into two groups:
   - **Temporary:** `Network`, 5xx, `RateLimited`.
   - **Permanent:** round-trip failure, domain error, 400, 404 on write.
2. On a temporary error, keep the local board and the pending commands
   (see C1), set `syncStatus = 'error'`, and show "Not saved — will retry".
   Retry with backoff (for example 2 s, 5 s, 15 s, then every 60 s), and
   right away on the `online` event.
3. On a 401, keep the pending work as well. Open the settings screen as
   today, and flush again once a new token is saved.
4. Roll back only on permanent errors.
5. Make `hasUnsavedWork` true while unsent work exists in the `error`
   state.
6. Add tests for each group.

### E2 (Medium): Every 403 is treated as a rate limit; every 422 as a conflict

**Problem.** In [client.ts:96-101](../src/github/client.ts#L96-L101):

- **403 → `RateLimited`.** GitHub also sends 403 when the token lacks
  permission (for example, Contents is read-only, or the repository is
  archived). The app then retries 4 times and says "GitHub API rate limit
  hit", which sends the user in the wrong direction.
- A primary rate limit has no `Retry-After` header, only
  `x-ratelimit-reset`. So the retries use the 250 ms-1.5 s backoff and
  just use up the remaining attempts.
- **422 → `Conflict`.** GitHub also sends 422 for validation errors (for
  example, an invalid branch name). These go into the merge and retry
  path until the attempt limit, and then say "Could not save after
  several attempts".

**Fix.**

1. Map 403/429 to `RateLimited` only if `x-ratelimit-remaining === '0'` or
   a `Retry-After` header is present. Compute the wait from `Retry-After`,
   or else from `x-ratelimit-reset`.
2. Map every other 403 to a new error type,
   `{ type: 'Forbidden'; message: string }`. Use GitHub's `message` from
   the response body. User text: "The token cannot write to this
   repository. Check that Contents is set to Read and write."
3. For 422, read the body. Treat it as `Conflict` only if the message is
   about the sha (`does not match`, `wasn't supplied`). Otherwise return
   `Unknown` with the message.
4. Add client tests for 401, 403 with and without rate-limit headers,
   404, 409, 422 (both kinds), 429, and 500.

### E3 (Medium): Old error messages stay visible after a successful save

**Problem.** `errorMessage` is cleared only in `performLoad`
([board.ts:124](../src/store/board.ts#L124)). A successful write
([board.ts:313-317](../src/store/board.ts#L313-L317)), the "nothing
changed" path (line 289), and `keepTheirs` (line 428) set
`syncStatus = 'saved'` but keep the old message. The badge then shows
"Saved" together with, for example, "Network error: Failed to fetch".

**Fix.**

1. Add one helper, `setStatus(status, message: string | null = null)`,
   and use it everywhere instead of setting the two refs separately.
2. Add a test: error → next write succeeds → `errorMessage === null`.

### E4 (Medium): GitHub responses are not validated; files over 1 MB fail with an unclear message

**Problem.**

- `getFile` and `putFile` cast `response.json()` with `as`
  ([client.ts:25](../src/github/client.ts#L25),
  [client.ts:58](../src/github/client.ts#L58)) and do not check the shape.
  `response.json()` can also throw (for example, a proxy error page). The
  exception escapes the `Result` type. The queue then reports it as
  "Internal error: …". In `SetupView.testConnection()`
  ([SetupView.vue:142](../src/components/SetupView.vue#L142)), there is no
  queue, so the promise is rejected and nothing handles it. The button
  stays on "testing" forever.
- The Contents API returns file content only up to 1 MB. For larger files,
  it returns `encoding: "none"` and an empty `content`. The app then says
  `Unexpected encoding "none"`. If `path` points to a directory, the
  response is an array, and the message says `Unexpected encoding
"undefined"`.

**Fix.**

1. Wrap `response.json()` in `try/catch`. On failure, return
   `err({ type: 'Unknown', status, message: 'Invalid JSON from GitHub' })`.
2. Write small type guards (`isContentsGetResponse(value: unknown)`,
   `isContentsPutResponse`). Use them instead of `as`. This also removes
   the need for the ESLint exemption (L1).
3. Handle each case with a clear message:
   - array → "Path points to a folder, not a file";
   - `encoding === 'none'` → "learning.md is larger than 1 MB, which the
     GitHub Contents API cannot read".
4. Document the 1 MB limit in the README (D1).
5. Add client tests for these cases.

### E5 (Medium): Invalid UTF-8 is replaced without warning and then written back

**Problem.** `decodeBase64Utf8` uses `new TextDecoder('utf-8')`
([client.ts:130](../src/github/client.ts#L130)). That decoder replaces
invalid bytes with U+FFFD and does not report an error. Suppose a hand
edit saves the file as Latin-1 and it still parses. The next save then
writes the replacement characters back, and the original characters are
lost for good.

**Fix.**

1. Use `new TextDecoder('utf-8', { fatal: true })`.
2. Catch the `TypeError` in `getFile` and return an error that the store
   shows like a parse error: "learning.md is not valid UTF-8".
   Writes stay blocked.
3. Add a test with invalid bytes.

### E6 (Medium): Bad or blocked `localStorage` stops the app from starting

**Problem.** In `src/store/settings.ts`:

- `localStorage.getItem` (lines 27 and 40) and `setItem` (lines 50 and 54)
  have no `try/catch`. When storage is blocked (some privacy modes, or
  site data disabled), `getItem` throws `SecurityError`. The settings
  store is created at startup, so the page stays blank. `theme.ts` and
  `tagFilter.ts` already handle this case. `settings.ts` does not.
- `JSON.parse(raw) as PersistedSettings` (line 30) is not validated. A
  stored value like `{}` sets `owner` to `undefined`. The computed
  `isRepoConfigured` then calls `undefined.trim()` and throws on startup.

**Fix.**

1. Wrap every `localStorage` call in `try/catch`, as the other stores do.
2. Validate the parsed object: each field must be a non-empty string.
   Otherwise, use the defaults.
3. If `setToken` cannot store the token, keep it in memory and show
   "The token could not be saved in this browser; you will need to enter
   it again after a reload."
4. Add tests: blocked storage, `{}`, `null`, and non-string fields.

### E7 (Low): No global error handler; the lazy highlight.js import can fail after a deploy

**Problem.**

- `main.ts` sets neither `app.config.errorHandler` nor a
  `window.addEventListener('unhandledrejection', …)` handler. Errors in
  watchers and event handlers go to the console only.
- `highlightCodeBlocks` loads highlight.js with a dynamic `import()`
  ([render.ts:118](../src/markdown/render.ts#L118)). After a new deploy to
  GitHub Pages, the old hashed chunk no longer exists. A tab that was
  opened before the deploy then fails this import, and the promise
  rejection in the drawer's watcher is not handled.

**Fix.**

1. In `main.ts`, add `app.config.errorHandler` and an
   `unhandledrejection` listener. Both should log the error and set a
   visible, non-blocking message (for example, through the board store's
   `errorMessage`).
2. In `highlightCodeBlocks`, catch the import error and return without
   highlighting.
3. Listen for Vite's `vite:preloadError` event and offer a reload ("A new
   version is available").

### E8 (Low): Users see internal JSON in error messages

**Problem.**

- Parse errors contain `JSON.stringify(error)`, for example
  `Invalid tag name: {"type":"InvalidTagName","value":"a b"}`
  (`src/format/parse.ts`, several places).
- `applyClientError` shows the raw GitHub response body for `Unknown`
  errors. This can be a long JSON text.
- `describeError(type: string)` in `SetupView.vue` (line 193) takes a
  plain `string`. This turns off the exhaustiveness check. `Conflict`,
  `NotFound`, and `Unknown` all show "Request failed (Unknown)", without
  the status code or message.

**Fix.**

1. Add `describeValidationError(error: ValidationError): string` in
   `factories.ts` and use it in the parser.
2. For `Unknown` errors, parse the body and show only its `message` field,
   cut to about 200 characters.
3. Change `describeError` to take a `GithubClientError`, and handle every
   `type` in a `switch`. The `switch-exhaustiveness-check` lint rule then
   covers it.
4. Remove the unused `validate()` action from the board store
   ([board.ts:484](../src/store/board.ts#L484)), or call it in dev mode
   after each command.

---

## 6. Documentation

### D1 (Medium): README statements that do not match the code

| README text                                                                                                | Reality                                                                                         |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| "This check runs on every save" (line 312)                                                                 | The keepalive flush skips the round-trip check (C2).                                            |
| "If you try to close the tab … while a write is still pending, the browser asks you to confirm" (line 331) | Not while the settings screen is open, and not in the conflict state (C4).                      |
| "a refresh can never throw away work you have not saved yet" (line 352)                                    | Not true because of C1, C2, and C3.                                                             |
| "Future ideas: Code review" (line 372)                                                                     | Done with this document.                                                                        |
| The Development section lists `lint`, `typecheck`, `test`, `build`                                         | `format`, `lint:fix`, and `test:watch` exist but are not listed. There is no format check (F1). |
| (not mentioned)                                                                                            | `learning.md` cannot be larger than 1 MB (E4).                                                  |
| (not mentioned)                                                                                            | Which Node version to use (P2).                                                                 |

**Fix.**

1. Fix C1–C4 first. Then re-read the "Saving and conflicts" section and
   the round-trip paragraph against the new code.
2. Remove "Code review" from "Future ideas".
3. List all scripts in "Development", including the new `format:check`
   and `test:coverage` scripts (F1, Q3).
4. Add the 1 MB limit to the file format section.
5. Add the required Node version (P2).

### D2 (Low): No architecture overview for developers

**Problem.** The README explains usage well. A developer, though, has to
read the code to learn the structure:

- the layers: `domain` → `format` → `github` → `store` → `components`;
- the command flow: UI → `applyAndSync` → `applyCommand` → debounce →
  `serialize` → round-trip → `putFile` → merge;
- the `Result` pattern and the branded types;
- where to add a new command (types, `applyCommand`, `commitMessage`,
  merge, tests).

**Fix.** Add a short "Architecture" section to the README (or
`doc/architecture.md`). Include a folder table, the write-path diagram
from `doc/requirement-1-concurrency.md`, and a checklist for "adding a
new command".

### D3 (Low): Unclear or wrong code comments

- [board.ts:75](../src/store/board.ts#L75) and
  [board.ts:249](../src/store/board.ts#L249) refer to "phase 2/4 of the
  plan" without naming the file. Use
  `see doc/requirement-1-concurrency.md, phase 2`.
- `tsconfig.node.json` line 9 says `/* Bundler mode */`, but the file uses
  `"module": "nodenext"`.
- `formatTimestamp` says it handles `null`/`undefined` for "data written
  before timestamps existed". The domain type never allows `null`. Either
  remove this branch or explain when it can happen.
- `applyAndSync` returns a `Promise` that resolves _before_ the write.
  Every caller uses `void`. Return `void`, or document that the promise
  does not wait for the write.
- `validate()` in the board store has no documentation and no caller
  (E8).

**Fix.** Update the comments as listed above.

### D4 (Low): Requirement documents do not track their implementation status

**Problem.** In `doc/requirement-1-concurrency.md`, Phase 5 is not
implemented, and issue C7 is listed but not solved (see C3 here). The
document does not say this, so it reads as if everything is done.

**Fix.** Add a short "Status" section at the top of each requirement
document. List what is implemented, what is not, and the reason. Update it
when a requirement changes.

---

## 7. Strictness (TypeScript, warnings as errors)

### T1 (Medium): `tsconfig.node.json` is not strict

**Problem.** `tsconfig.node.json` (which checks `vite.config.ts`) has no
`"strict": true` and none of the extra strict flags that
`tsconfig.app.json` uses. `eslint.config.js` is not type-checked at all.

**Fix.**

1. Add `"strict": true`, `"noUncheckedIndexedAccess": true`,
   `"exactOptionalPropertyTypes": true`,
   `"noPropertyAccessFromIndexSignature": true`,
   `"noImplicitReturns": true`, and `"noImplicitOverride": true` to
   `tsconfig.node.json`.
2. Rename `eslint.config.js` to `eslint.config.ts` (supported by ESLint
   10), and add it to the `include` of `tsconfig.node.json`.
3. Run `pnpm typecheck` and fix the errors.

### T2 (Medium): Vue templates are not type-checked strictly

**Problem.** `vue-tsc` runs without `vueCompilerOptions`. By default, an
unknown prop, event, or component in a template is not an error. For
example, `<SectionColumn :dragDisabld="x">` (a typo) would compile
without an error.

**Fix.**

1. Add to `tsconfig.app.json`:

   ```json
   "vueCompilerOptions": { "strictTemplates": true }
   ```

2. Run `pnpm typecheck` and fix what it finds.

### T3 (Low): App code and test code share one tsconfig, and app code gets Node types

**Problem.** `tsconfig.app.json` includes both `src/` and `tests/`, and
sets `"types": ["vite/client", "node"]`. Browser code can therefore use
`process` or `Buffer` without a type error, and the error only shows up
at runtime. `allowArbitraryExtensions` is not needed. `@vue/tsconfig` is
installed but not used.

**Fix.**

1. Keep `tsconfig.app.json` for `src/` only, with
   `"types": ["vite/client"]`. Extend `@vue/tsconfig/tsconfig.dom.json`
   (or remove that package, see P3).
2. Add `tsconfig.vitest.json` for `tests/`. It extends the app config and
   adds `"types": ["node", "vitest/globals"]` if needed.
3. Add it to the `references` in `tsconfig.json`.
4. Also consider `"noUncheckedSideEffectImports": true` and
   `"erasableSyntaxOnly": true`. The second one would flag the parameter
   property in `Cursor` (`parse.ts`), which is easy to rewrite.

### T4 (Low): Vue runtime warnings do not fail tests

**Problem.** A `[Vue warn]` during a component test (a missing prop, a
failed prop type, an unknown element) only prints to the console. The
test still passes.

**Fix.**

1. Add `tests/setup.ts` and register it with `test.setupFiles`.
2. In it, set `config.global.config.warnHandler = (msg) => { throw new
Error(msg); }` (from `@vue/test-utils`).
3. Also make tests fail on unexpected `console.error` calls (spy in
   `beforeEach`, assert in `afterEach`).

---

## 8. Linting

### L1 (Low): Broad lint exemptions and missing lint rules

The setup is already strong (`strictTypeChecked`,
`stylisticTypeChecked`, `--max-warnings 0`, the `as` ban). Gaps:

- The `as` ban is switched off for **whole files**:
  `src/github/client.ts` and `src/store/settings.ts`
  ([eslint.config.js:32](../eslint.config.js#L32)). Those are exactly the
  places where unchecked casts cause E4 and E6. `tagFilter.ts` shows the
  better pattern: an inline disable with a reason.
- Unused `eslint-disable` comments are only warnings by default. With
  `--max-warnings 0` they fail today, but this depends on the CLI flag.
- There are no lint rules for tests (focused `.only`, a test without
  `expect`, …).
- Non-null assertions in templates (`selectedItem!.id`,
  [BoardView.vue:271-278](../src/components/BoardView.vue#L271-L278)) are
  not reported.
- A few useful `eslint-plugin-vue` rules that are not part of the
  `recommended` set are off.

**Fix.**

1. Remove `client.ts` and `settings.ts` from the exemption list. Replace
   the casts with type guards (E4, E6), or use inline disables with a
   reason.
2. Add:

   ```js
   { linterOptions: { reportUnusedDisableDirectives: 'error', reportUnusedInlineConfigs: 'error' } }
   ```

3. Add `@vitest/eslint-plugin` with its `recommended` config for
   `tests/**`.
4. Enable `vue/no-unused-refs`, `vue/no-unused-properties`,
   `vue/no-undef-components`, `vue/require-typed-ref`,
   `vue/define-macros-order`, `vue/block-order`, and
   `vue/no-useless-v-bind`.
5. In `BoardView.vue`, pass the item id through the drawer's events
   (`editHeadline: [id, headline]`), or wrap the drawer in a small
   component with `v-if` that receives a non-null item. Then the `!` is
   not needed.

---

## 9. Formatting

### F1 (High): Formatting is not enforced; 30 files are not formatted

**Problem.** `prettier --check .` fails for 30 files. Among them are 12
source files (for example `BoardView.vue`, `merge.ts`, `client.ts`,
`base.css`) and 3 test files. The reasons:

- There is no `format:check` script.
- CI does not check formatting.
- There is no pre-commit hook.
- There are no editor settings (no `.vscode/settings.json` or
  `extensions.json`, although `.gitignore` expects one).

**Fix** (do F2 first):

1. Add the script `"format:check": "prettier --check ."`.
2. Run `pnpm format` once, in a commit of its own ("Apply Prettier").
   Add that commit's hash to `.git-blame-ignore-revs`.
3. Add `- run: pnpm format:check` to `ci.yml` before lint.
4. Optional: add `simple-git-hooks` with `lint-staged` to run
   `prettier --write` and `eslint --fix` on staged files.
5. Add `.vscode/extensions.json` (Prettier, ESLint, Vue - Official) and
   `.vscode/settings.json` with `"editor.formatOnSave": true` and Prettier
   as the default formatter.

### F2 (High): `pnpm format` would break the parser test fixtures and change the lockfile

**Problem.** `.prettierignore` lists only `dist`, `node_modules`, and
`coverage`. Running the existing `pnpm format` script would therefore:

- Reformat the 12 Markdown files in `tests/format/fixtures/`. Prettier
  puts a blank line between each `### headline` and its
  `<!-- id:… -->` line. The parser does not accept that. `valid.md` would
  stop parsing. Worse, the "should fail" fixtures would still fail, but
  for a different reason, so those tests would keep passing while they
  no longer test what their names say.
- Reformat `pnpm-lock.yaml`, which pnpm manages.

**Fix.**

1. Add to `.prettierignore`:

   ```
   pnpm-lock.yaml
   tests/format/fixtures/
   ```

2. Also consider making the fixture tests check the exact error reason,
   not only `ok === false`. Then a changed fixture fails the test.

### F3 (Low): Unused Prettier ESLint plugin; no `.editorconfig` or `.gitattributes`

**Problem.**

- `eslint-plugin-prettier` is installed but not used. Only
  `eslint-config-prettier` is used, which is the setup the Prettier team
  recommends.
- There is no `.editorconfig`, and no `.gitattributes`. The repository is
  on a Windows drive (`/mnt/e/…`), so CRLF line endings can get into
  commits through a Windows editor or Git's `core.autocrlf`.

**Fix.**

1. `pnpm remove eslint-plugin-prettier`.
2. Add `.gitattributes` with `* text=auto eol=lf`.
3. Add `.editorconfig` (`indent_size = 2`, `end_of_line = lf`,
   `insert_final_newline = true`, `charset = utf-8`).
4. Add `"endOfLine": "lf"` to `.prettierrc.json`, so it is stated
   explicitly.

---

## 10. Tests

### Q1 (High): The risky concurrency and error paths have no tests

**Problem.** `tests/store/board.test.ts` covers the main paths well
(load, debounce, batch, 409 plus merge, conflict, round-trip gate). It has
no tests for the cases that caused C1–C3 and E1–E3:

- an edit while a PUT or GET is in flight;
- a keepalive flush while a queued write is in flight;
- a refresh while the conflict dialog is open;
- network, 5xx, and 403 errors on write;
- clearing `errorMessage` after a later success;
- the rate-limit path with and without `Retry-After`.

**Fix.** Add one test per finding. Write it first so that it fails, then
fix the code. The test in C1 is ready to use.

### Q2 (Medium): Few component tests; the GitHub client error mapping has no tests

**Problem.**

- `SectionColumn` is the only component with a test. `BoardView`,
  `ItemDetailDrawer`, `SetupView`, `ItemCard`, and `ConflictBanner` have
  none. `doc/requirement-1-concurrency.md` section 6 asks for a component
  test of the `beforeunload` handler. It does not exist.
- `tests/github/client.test.ts` has 3 tests (cache mode, keepalive). The
  status-to-error mapping, base64 with non-ASCII text, and bad JSON have
  no tests.

**Fix.** Add these tests:

1. `BoardView`: `beforeunload` with and without pending work; hidden →
   flush; visible → refresh.
2. `ItemDetailDrawer`: blur saves, Ctrl+S saves, no emit when nothing
   changed, draft updates from the store (C6).
3. `SetupView`: save flushes first; deleting a tag shows the right count.
4. `client`: one test per HTTP status, a Unicode round trip, and bad JSON.

### Q3 (Medium): No coverage measurement

**Problem.** There is no coverage tool, so nobody can see which code has
no tests. `.prettierignore` already lists `coverage`, so it seems it was
planned.

**Fix.**

1. `pnpm add -D @vitest/coverage-v8`.
2. In `vite.config.ts`:

   ```ts
   coverage: {
     provider: 'v8',
     include: ['src/**'],
     thresholds: { lines: 80, branches: 75 },
   }
   ```

   Start with thresholds just below today's numbers, then raise them.

3. Add the script `"test:coverage": "vitest run --coverage"`, and use it
   in CI instead of `pnpm test`.

### Q4 (Low): All tests run in jsdom (92 % of the test time is jsdom setup)

**Problem.** `environment: 'jsdom'` applies to all 19 files. Vitest
reports that 92 % of the 36 s is spent creating jsdom. Most tests
(`domain`, `format`, `search/match`) do not use the DOM.

**Fix.**

1. Set `environment: 'node'` as the default.
2. Add `// @vitest-environment jsdom` at the top of the files that need a
   DOM (components, `markDom`, `theme`, `tagFilter`, `settings`, `render`),
   or use Vitest `projects` with one project per environment.
3. Add `restoreMocks: true` and `unstubGlobals: true` to the test config.
4. Use `vi.mocked(fn)` instead of `as ReturnType<typeof vi.fn>` in the
   tests.

### Q5 (Low): No browser or end-to-end tests

**Problem.** Drag and drop, the CSP, the lazy highlight.js chunk,
`keepalive`, and `beforeunload` all behave differently in jsdom and in a
real browser. Nothing tests them in a browser.

**Fix.** Add a few Playwright tests (or use Vitest browser mode) against
`pnpm preview`. Mock `api.github.com` with `page.route`. Cover: first
setup, add an item, edit a description with a code block, a 409 that
merges, and the conflict dialog. Run them in CI.

---

## 11. CI and dependencies

### P1 (High): The deploy workflow does not wait for lint and tests

**Problem.** `deploy.yml` runs only `pnpm build` (which includes
`vue-tsc`). It runs at the same time as `ci.yml` and does not depend on
it. A push to `main` with failing tests or lint errors is still deployed.

**Fix.**

1. Change `ci.yml` to also run on `workflow_call`.
2. In `deploy.yml`, add a first job
   `checks: uses: ./.github/workflows/ci.yml`, and make `build` depend on
   it (`needs: checks`).
3. Alternatively, merge both workflows into one with the jobs
   `test` → `build` → `deploy`. Run `deploy` only on `main`.
4. Protect `main` in the GitHub settings: require the CI check to pass.

### P2 (Medium): Node versions are inconsistent (CI 22, types 24, local 25)

**Problem.**

- CI uses Node 22.
- `@types/node` is 24.
- The local machine has Node 25. Node 25 is an odd-numbered release and
  reached end of life in June 2026.
- There is no `engines` field and no `.nvmrc`, so nothing states which
  version is correct.

**Fix.**

1. Choose Node 24, the current Active LTS.
2. Add `.nvmrc` with `24`.
3. Add `"engines": { "node": ">=24 <25" }` to `package.json`.
4. In both workflows, replace `node-version: 22` with
   `node-version-file: .nvmrc`.
5. Keep `@types/node` at `^24`. Do not update it to 26, because the types
   must match the Node version in use. Move to Node 26 after it becomes
   LTS (October 2026).
6. Switch the local machine to Node 24.

### P3 (Medium): Unused and redundant dependencies

| Package                  | Why it can go                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `@types/markdown-it`     | `markdown-it` 15 ships its own types (`dist/markdown-it.d.mts`); TypeScript ignores the `@types` package. |
| `eslint-plugin-prettier` | Not used in `eslint.config.js` (F3).                                                                      |
| `@vue/tsconfig`          | Not used by any tsconfig. Either extend it (T3) or remove it.                                             |

**Fix.** `pnpm remove @types/markdown-it eslint-plugin-prettier` and
decide about `@vue/tsconfig`. Then run typecheck, lint, test, and build.

### P4 (Low): Pending updates; no automated dependency updates

**Problem.**

- Patch or minor updates are available for `vue` (3.5.43), `dompurify`
  (3.4.16), `vite` (8.3.1), `eslint` (10.11.0), `typescript-eslint`
  (8.70.1), `eslint-plugin-vue` (10.11.1), `prettier` (3.9.9), `jsdom`
  (30.1.1), `@vue/test-utils` (2.5.1), and `fast-check` (4.10.2).
- `typescript` 7.0 is out. It is the native (Go) compiler. The project
  pins `~6.0.2`. This is correct until `vue-tsc` and `typescript-eslint`
  officially support TypeScript 7, but the reason is not written down
  anywhere.
- None of the dependencies is deprecated. `ulidx` has not had a release
  since August 2024. It is small and stable, so this is fine for now.
- There is no Dependabot or Renovate config, so updates happen only by
  hand.

**Fix.**

1. Run `pnpm update`, and then all checks.
2. Add a comment in the README "Development" section (or next to the
   dependency): "TypeScript stays on 6.x until vue-tsc supports 7."
3. Add `.github/dependabot.yml` with two entries, `npm` and
   `github-actions`, on a weekly schedule. Group the minor and patch
   updates into one PR.

### P5 (Low): CI hardening

**Problem.**

- `ci.yml` has no `permissions:` block, so it gets the repository's
  default token permissions.
- There is no `concurrency` group, so old runs on the same PR keep
  running.
- Actions are pinned by major tag (`@v7`), not by commit SHA.

**Fix.**

1. Add `permissions: { contents: read }` to `ci.yml`.
2. Add
   `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`.
3. Optional: pin actions to full commit SHAs. Dependabot (P4) keeps them
   up to date.

---

## 12. Other findings

### O1 (Medium): Keyboard accessibility gaps

**Problem.**

- An item card is an `<li>` with `@click`
  ([ItemCard.vue:104](../src/components/ItemCard.vue#L104)). It is not
  focusable and has no key handler, so keyboard users cannot open an
  item.
- The conflict dialog and the two confirm dialogs have no
  `role="dialog"`, no `aria-modal`, no initial focus, and no focus trap.
- `autofocus` on the headline input
  ([ItemCard.vue:112](../src/components/ItemCard.vue#L112)) has no effect
  on elements that are added after the page loads. After a double-click,
  the input therefore does not have focus.

**Fix.**

1. Put a `<button class="card-open">` around the headline, or add
   `tabindex="0"`, `role="button"`, and Enter/Space handlers to the card.
2. Use the native `<dialog>` element with `showModal()` for the three
   dialogs. It gives focus trapping, Escape handling, and the ARIA role
   for free.
3. Replace `autofocus` with a template ref and
   `nextTick(() => input.focus())` in `startEdit`.

### O2 (Low): URL parts are not encoded

**Problem.** `owner` and `repo` go into the API URL without encoding
([client.ts:17](../src/github/client.ts#L17),
[client.ts:44](../src/github/client.ts#L44)). The same is true for the
github.com links in `BoardView.vue` and `SetupView.vue`. A stray `/`, `?`,
or `#` in the settings produces a different request than intended. The
risk is low, because users can only reach their own data with their own
token.

**Fix.**

1. Use `encodeURIComponent` for `owner`, `repo`, and `branch`, and
   `encodePath` for `path`, everywhere a URL is built.
2. Put the github.com URL builders in one helper, so that `BoardView` and
   `SetupView` share them.
3. Validate owner and repo names in `SetupView` against GitHub's allowed
   characters (`[A-Za-z0-9._-]`).

---

## 13. Suggested order

1. **F2, then F1.** Protect the fixtures, format everything once, and
   enforce formatting in CI. (Small; this makes all later diffs clean.)
2. **P1.** Stop deploying untested code.
3. **Q1 + C1.** Add the failing test, then change the store to store
   commands and rebase them (C1). This is the only critical item.
4. **C2, C3, E1, E3.** They build on the C1 changes in the same store.
5. **C4, C5, C6.** Wiring in the UI.
6. **E2, E4, E5, E6, E7, E8.** Client and settings robustness, each with
   tests (Q2).
7. **T1, T2, T3, T4, L1.** Stricter checks. Expect a few small fixes.
8. **P2, P3, P4, P5, F3, Q3, Q4.** Tooling cleanup.
9. **O1, O2, Q5, D2, D3, D4.**
10. **D1.** Update the README last, so that it describes the final
    behavior.
