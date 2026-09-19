# Requirement 1: Concurrency and Conflicts

Status: analysis and plan. Nothing is implemented yet.

## 1. The reported problem

The app reports a conflict with the GitHub version although only one browser
tab is open. It happens when several items are added quickly, one after
another. It also happens right after pressing F5.

There is no second writer in this situation. So every conflict the user sees
in it is a false conflict. The app treats a stale `sha` as if another person
had changed the file.

## 2. How saving works today

The relevant code:

- [`src/github/client.ts`](../src/github/client.ts) — `getFile` and `putFile`,
  thin wrappers over the GitHub Contents API.
- [`src/store/board.ts`](../src/store/board.ts) — `load`, `applyAndSync`,
  `writeBoard`, `retryAfterConflict`, `resolveConflict`.
- [`src/components/BoardView.vue`](../src/components/BoardView.vue) — calls
  `load` on mount and on every `visibilitychange`.

The flow:

1. `load()` does `GET /repos/{owner}/{repo}/contents/{path}?ref={branch}`.
   It stores the file text as the board and the blob `sha`.
2. Every user action becomes a `Command`. `applyAndSync` applies it to the
   in-memory board and writes the whole file back with
   `PUT /repos/{owner}/{repo}/contents/{path}`, passing the stored `sha`.
3. GitHub answers `409` or `422` when the passed `sha` is not the current
   blob sha. The client maps both to `Conflict`.
4. `retryAfterConflict` reads the file once more, then writes once more. If
   that second write also fails with `Conflict`, the app shows the conflict
   dialog.

Only `reorder` is debounced (1000 ms). Every other command is one HTTP PUT
and one git commit.

## 3. Root causes of the false conflicts

Four causes work together. Each one alone can produce the symptom.

### 3.1 The browser HTTP cache serves an old `sha`

This is the most likely cause of the F5 case.

`request()` in [`src/github/client.ts`](../src/github/client.ts) calls `fetch`
without a `cache` option, so the default mode `"default"` applies. That mode
uses the browser's HTTP cache.

The GitHub REST API answers authenticated requests with a header like
`Cache-Control: private, max-age=60`. The browser is therefore allowed to
answer the next identical GET from its own cache for up to 60 seconds,
without contacting GitHub at all.

What the user sees:

1. The user adds an item. The PUT succeeds. The file on GitHub now has blob
   sha `B`. The browser's cached GET response still holds sha `A`.
2. The user presses F5. `load()` runs. The GET is answered from the cache
   with sha `A`. The app now believes the current sha is `A`.
3. The user adds an item. The PUT sends sha `A`. GitHub answers `409`.
4. `retryAfterConflict` does another GET. Same URL, same cache entry, still
   within 60 seconds — so it is answered from the cache again with sha `A`.
5. The second PUT sends sha `A` again and fails again. The app shows the
   conflict dialog.

This also explains why both sides of the dialog look identical to the user:
the "GitHub version" shown is the cached old version, not the real one.

**How to confirm:** open DevTools → Network, filter on `api.github.com`,
reload the app and look at the Size column of the `contents/learning.md`
request. `(disk cache)` or `(memory cache)` instead of a byte count confirms
this cause.

### 3.2 GitHub's Contents API is read-after-write consistent only eventually

This is the most likely cause of the "several items in quick succession" case.

GitHub serves the Contents API from replicas. Right after a commit, a GET can
still return the previous blob sha, and the `sha` check of a PUT can be
evaluated against a replica that has not caught up. Writing the same file
several times within a few seconds is exactly the pattern that triggers this.

The current retry makes it worse instead of better: it re-reads _immediately_,
so it is likely to read the same stale state, fail a second time, and then
declare a user-facing conflict.

### 3.3 One HTTP write per user action

`applyAndSync` writes on every command. Adding five items quickly means five
PUTs and five commits inside a few seconds. That maximises the exposure to
3.2 and produces a noisy git history. Only `reorder` is debounced.

### 3.4 `load()` runs outside the write queue

`enqueue` in [`src/store/board.ts`](../src/store/board.ts) serialises writes,
but `load()` and `initializeEmptyFile()` do not go through it.

`load()` is called on mount and on every `visibilitychange`. So switching
away from the tab and back while a save is in flight starts a GET that runs
in parallel with the PUT. If the GET resolves after the PUT, it overwrites
`sha` with the value from before the save and overwrites `board` with the
version from before the save. The next write then sends a stale sha and gets
a `409` — a false conflict, plus silent loss of the local change.

### 3.5 The retry logic cannot tell a stale sha from a real change

`retryAfterConflict` compares the fresh remote board with `previousBoard`,
but it never asks the two questions that matter:

- Is the remote content byte-identical with what we believe we already have?
  Then the sha was merely stale. Take the new sha and write again — this is
  not a conflict.
- Is the remote content byte-identical with what we were trying to write?
  Then our write actually landed and only the response was lost. Take the new
  sha and stop — this is not a conflict either.

It also retries exactly once, with no delay and no backoff. A replica that is
200 ms behind will still be behind.

## 4. Other concurrency issues found

These are separate from the reported bug. They are listed by severity.

| #   | Issue                                                                                                                                                                                                                       | Effect                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| C1  | A pending debounced reorder is only in memory for up to 1000 ms. A reload, a tab close, or a `visibilitychange` load inside that window discards it.                                                                        | Silent data loss.          |
| C2  | `applyReorderDebounced` writes into `board.value` outside the queue. If a write that is in flight fails, `writeBoard` rolls back to `previousBoard` and the drag is discarded with it.                                      | Silent data loss.          |
| C3  | `writeBoard`'s rollback replaces the whole board. It discards every local change made during the request, not only the failed one.                                                                                          | Silent data loss.          |
| C4  | Two `load()` calls can be in flight at once (mount plus `visibilitychange`). The one that resolves last wins, which is not always the newer one.                                                                            | Stale board and stale sha. |
| C5  | `initializeEmptyFile()` is not queued and its button is not disabled while it runs. A double click sends a second PUT with `sha: null` against a file that now exists → `422` → an error the user cannot act on.            | Confusing error.           |
| C6  | `enqueue` returns a promise that rejects if the job throws, for example when `config()` throws because the token is null. All call sites use `void`, so this becomes an unhandled rejection instead of a message in the UI. | Silent failure.            |
| C7  | While the conflict dialog is open, a `visibilitychange` load can still replace `board` and `sha` underneath it. `resolveConflict('keepTheirs')` then keeps a version that is already outdated.                              | Wrong resolution.          |
| C8  | Closing the tab while `syncStatus` is `saving`, or while a debounce timer is pending, loses data with no warning.                                                                                                           | Silent data loss.          |
| C9  | `syncStatus` is one global value shared by loads and writes. A background load sets it to `loading` while a write is running, so the overlay reports the wrong operation. `saved` also never expires.                       | Misleading status.         |
| C10 | Two tabs on the same device do not know about each other. Each discovers the other only through a `409`.                                                                                                                    | Avoidable conflicts.       |

## 5. Plan

Five phases. Phase 1 alone should remove the reported symptom. Phases are
ordered by value per effort and can ship separately.

### Phase 1 — Stop the false conflicts

**1.1 Bypass the browser HTTP cache.**
In [`src/github/client.ts`](../src/github/client.ts), pass `cache: 'no-store'`
to every `fetch`. Reads then always reach GitHub. The Content-Security-Policy
in [`index.html`](../index.html) already allows `https://api.github.com`, so
nothing changes there. The cost is a few more requests against a limit of
5000 per hour, which this app never approaches.

**1.2 Remember the base text, not only the sha.**
Add `baseText: string | null` next to `sha` in the board store. It holds the
exact file text that `sha` refers to. Set it in `load()` (the text that was
read) and after a successful `putFile` (the text that was written). This one
value makes both the false-conflict checks below and the merge in Phase 3
possible.

**1.3 Replace `retryAfterConflict` with a `reconcile` step.**
On `Conflict`, read the file fresh and then decide:

| Remote text equals         | Meaning                                           | Action                                             |
| -------------------------- | ------------------------------------------------- | -------------------------------------------------- |
| the text we tried to write | Our write landed, or someone wrote the same thing | Adopt the fresh sha and text, report `saved`, stop |
| `baseText`                 | The sha was stale, nothing really changed         | Adopt the fresh sha, write again                   |
| neither                    | The file really diverged                          | Go to Phase 3 merge, or show the dialog            |

**1.4 Retry with backoff.**
Allow up to four attempts, with delays of roughly 250, 750 and 1500 ms plus a
small random jitter, before the app declares a conflict. Apply the same to
`RateLimited`, honouring the `retryAfterSeconds` the client already parses.
This covers the replica lag from 3.2.

**1.5 Skip writes that change nothing.**
If `serialize(nextBoard) === baseText`, set the status to `saved` and send no
request. This removes empty reorder flushes and empty retries.

### Phase 2 — Fewer writes, no races

**2.1 Put every GitHub call on one queue.**
Route `load`, `initializeEmptyFile`, `flushPending` and `resolveConflict`
through `enqueue`, not only `commit`. A read can then never interleave with a
write (fixes 3.4, C4, C5, C7).

**2.2 Coalesce all commands, not only reorder.**
Keep a pending board and a list of pending commit messages. Flush after about
800 ms of quiet, and force a flush after a hard cap (for example 5 seconds or
10 commands) so nothing stays unwritten for long. Apply commands to the board
immediately, as today, so the UI stays instant.

Commit message: one pending command keeps today's message from
[`src/format/commitMessage.ts`](../src/format/commitMessage.ts); several
become a subject line such as `Update learning.md (4 changes)` with one
existing message per line in the body.

This cuts "add five items quickly" from five writes to one.

**2.3 Never let a background load overwrite unsaved work.**
When the `visibilitychange` load finds a pending flush or a write in flight,
skip it and re-check after the flush instead (fixes C1 partly, C2, C3).

**2.4 Make `enqueue` absorb failures.**
Catch inside the job, turn the error into `errorMessage` plus
`syncStatus = 'error'`, and always resolve the returned promise (fixes C6).

**2.5 Disable the "Create it" button while `initializeEmptyFile` runs**
(fixes C5).

### Phase 3 — Merge instead of asking

Today every real divergence becomes a modal that throws one side away. Most
divergences are mergeable, because items carry a stable ULID.

Add `src/domain/merge.ts` with
`merge(base: Board, local: Board, remote: Board): Result<Board, MergeConflict>`:

- Build an id → item map for each of the three boards.
- Item only in `local` → keep it (a local add).
- Item only in `remote` → keep it (a remote add).
- Item in `base`, missing on one side → the delete wins.
- Item changed on one side only → take the changed side.
- Item changed on both sides to the same value → take it.
- Item changed on both sides to different values → a real conflict; keep the
  dialog for this case only.
- Order: start from the remote order, then insert local-only items at their
  local relative positions. An order difference alone must never produce a
  conflict.
- Run `validateBoard` on the result before writing it.

Then `reconcile` from 1.3 calls `merge(baseBoard, localBoard, remoteBoard)`
and writes the merged board with the fresh sha. Only an unmergeable result
reaches [`ConflictBanner.vue`](../src/components/ConflictBanner.vue).

Also reword the dialog. "Someone else saved learning.md first" is wrong
whenever there is no someone else. Something like "learning.md changed in two
places" fits both cases.

### Phase 4 — Warn before losing data on unload

This is the idea from the requirement.

**4.1 Guard the unload.**
Register a `beforeunload` handler while there is unsaved work — that is, a
write in flight or a pending debounce. Call `event.preventDefault()` in it.
The browser then shows its own generic dialog; custom text is not possible in
any current browser, and the dialog only appears if the user has interacted
with the page. Unregister the handler as soon as everything is saved, so the
dialog never appears without reason. A small watcher on the "has unsaved
work" state is the cleanest place for this.

**4.2 Flush before the tab goes away.**
On `visibilitychange` to `hidden` and on `pagehide`, flush a pending debounce
at once. Send that PUT with `keepalive: true`, which lets the request finish
after the page is gone (the body limit is 64 KB, far above one `learning.md`).
This makes 4.1 a rare last resort rather than the normal path.

**4.3 Show unsaved work in the UI.**
Split `syncStatus` into a load status and a write status, or at least give the
write precedence in
[`SyncStatusOverlay.vue`](../src/components/SyncStatusOverlay.vue). Add a
visible "unsaved changes" state for the debounce window, and let `saved` fade
after a few seconds so it cannot be mistaken for a fresh result (fixes C9).

### Phase 5 — Multi-tab coordination (optional)

Open a `BroadcastChannel('learning-tracker')`. After every successful write,
publish the new `sha` and text. Other tabs adopt it instead of finding out
through a `409`. If that is not enough, use `navigator.locks` to let only one
tab write at a time (fixes C10).

## 6. Tests

[`tests/store/board.test.ts`](../tests/store/board.test.ts) already mocks
`getFile` and `putFile`, so the new cases fit the existing setup.

Store tests:

- `409`, then a fresh read equal to `baseText` → the retry succeeds, no dialog.
- `409`, then a fresh read equal to the text we tried to write → status
  `saved`, no second PUT, no dialog.
- `409` on every attempt → exactly the planned number of attempts, with fake
  timers checking the backoff delays.
- A real divergence → merged and written; an unmergeable one → dialog.
- A load that resolves during a write does not overwrite `sha` or `board`.
- A write whose text equals `baseText` sends no request.
- Several commands within the debounce window produce one PUT with the
  combined commit message.
- `enqueue` with a throwing job resolves and sets `syncStatus = 'error'`.

New `tests/domain/merge.test.ts`, plus `fast-check` properties in the style of
[`tests/format/roundtrip.property.test.ts`](../tests/format/roundtrip.property.test.ts):

- `merge(base, local, base)` equals `local`.
- `merge(base, base, remote)` equals `remote`.
- `merge(b, b, b)` equals `b`.
- Every successful merge passes `validateBoard`.
- No item is lost unless one side deleted it.

Component test: the `beforeunload` handler is registered while work is pending
and removed once everything is saved.

Manual check: the DevTools step from 3.1, before and after the `no-store`
change.

## 7. Risks and trade-offs

- **Debounced writes keep data in the browser only.** For up to about a
  second, a new item exists nowhere else. A browser crash loses it. Phase 4
  reduces this to a small window; a short debounce and the hard cap keep it
  small.
- **Automatic merges can surprise.** The user no longer sees every
  divergence. Every version stays in the repository's git history, which is
  the escape hatch. A short notice such as "merged changes from GitHub" keeps
  it visible.
- **`no-store` costs a few more requests.** Irrelevant at this app's volume.
- **The `beforeunload` dialog cannot carry our own text.** Browsers show a
  generic message. It must only be armed when there is really unsaved work,
  otherwise it becomes noise the user learns to click away.

## 8. Suggested order

1. Phase 1 plus 4.1 and 4.2. Small, and very likely enough for the reported
   bug.
2. Phase 2. Removes the remaining races and most of the write volume.
3. Phase 3. Turns the rest of the conflicts into merges.
4. Phase 4.3 and Phase 5 when needed.

## 9. Documentation to update

[`README.md`](../README.md) has no section about saving and conflicts. When
this is implemented, add one that explains: changes are collected for a short
moment and then written as one commit; the app retries a stale write on its
own; it merges changes from GitHub where it can; it warns before the tab is
closed with unsaved work; the dialog only appears for a real, unmergeable
conflict. The "Future ideas" list may need a line removed or added too.
