# Instructions for Claude

This file holds instructions only. A fact about the system (what the app does, and why) goes into a spec
in `openspec/specs/`, not into this file.

## Documentation map

Each fact lives in exactly one place:

| Place              | Holds                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `README.md`        | For humans: introduction, setup steps 1–4, short feature overview, Development, Development workflow, Future Work, Glossary |
| `openspec/specs/*` | What the app does (requirements and scenarios) and why (optional `**Rationale**:` lines)                                    |
| `CLAUDE.md`        | Instructions for the agent: documentation map, writing rules, architecture, procedures, rules for each change               |

## Writing rules

### Group 1: all documentation

These rules apply to `README.md`, the specs, the OpenSpec artifacts, and this file.
Code comments follow Group 1 loosely.

1. Prefer Glossary terms (see the Glossary in `README.md`).
   Use one term for each concept and one meaning for each term.
   A change that needs a new term adds the term to the Glossary.
   Add a term only when it is used in more than one place, or when its meaning is not obvious.
2. Use active voice and name the actor.
3. Do not use vague quantifiers or approximations:some, any, several, many, a few, about, nearly,
   approximately, usually, typically, sufficiently, fast, appropriate, user-friendly, easy.
   Where the vagueness is real, write a condition instead ("If the browser blocks …").
4. Give numbers with units and limits.
5. Write one idea per sentence where possible.
6. Use "it" or "they" only when exactly one noun can match.
7. Use "always" and "never" only when the statement is literally true.
8. Do not use "and/or", slashes between alternatives, or parentheses that add new meaning.
9. Define abbreviations in the Glossary, or spell them out at first use.
10. Do not use superfluous infinitives: "be able to", "be capable of", "be designed to".
11. Do not use open-ended lists: "including but not limited to", "etc.", "and so on".
    "For example" is allowed, because it marks the list as a sample.
12. Write Glossary terms in lower case.
    Capitalize only proper nouns (for example GitHub), the status names New, WIP, Complete, and Discarded,
    the name Uncategorized, and UI labels quoted as they appear.

### Group 2: requirement statements in specs

1. Use the pattern `[WHEN|WHILE|IF <condition>,] The <subject> SHALL <action> [object] [condition].`
   A condition can come first or last.
   Prefer Glossary terms for the subject and the object.
   Use SHALL, not MUST.
2. State one thought per requirement.
   Split separate actions into separate requirements.
3. Do not use pronouns.
   Repeat the noun.
4. Do not use escape clauses: "if possible", "where practical", "as needed".
5. Use "each", not "all" or "any".
6. State conditions explicitly with WHEN, WHILE, or IF.
   Anchor "before" and "after" to a named event.
7. Prefer positive statements.
   Use SHALL NOT when the prohibition is the point.
8. State what, not how.
   A deliberate design constraint is allowed with a rationale.
9. Add an optional one-line `**Rationale**:` when the requirement is not self-evident.
10. Use concrete values in scenarios.

**Rationale format.** A rationale is one line, `**Rationale**: …`,
after a blank line below the requirement text and before the first scenario.
A rationale contains no SHALL.
Do not wrap a rationale to a second line, because the OpenSpec parser then adds the second line to the requirement text.
Do not use a `#### Rationale` heading, because the parser counts it as a scenario.

### Code

1. Identifiers (types, functions, variables, files, components) and UI text prefer Glossary terms.
   Do not use synonyms for Glossary terms.

## Rules for each change

- Before a change is complete, run `pnpm check`.
  The change is complete only when each step passes.
  Fix errors properly.
  Do not remove tests, linters, or lint rules to make a step pass.
- When you add a third-party library, use the latest stable release, unless a pin below names a version.
- A breaking change to `learning.md` needs a new format version and a migration.
  Follow the procedure "Add a format version" below.
- If the handling of an edge case is unclear, ask the user, or name the risk to the user.
  Do not guess the correct behaviour.
- During apply, do not change a spec without asking the user first.
- Before a change is complete, check that `README.md` and the specs match the code,
  and update them if they do not.
- A change that implements a Future Work item removes the item from the list in `README.md`.

## Architecture

The code is split into layers. Each layer uses only the layers above it in this table.

| Folder                                      | What it holds                                                                                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/`                               | The data model (`types.ts`), validated factories for the branded types, the commands (`applyCommand`), and the 3-way `merge`. No I/O.        |
| `src/format/`                               | `parse` and `serialize` for `learning.md`, the commit messages, and `version.ts` (the format version). `migrations/` upgrades old files.     |
| `src/github/`                               | The GitHub Contents API client. It returns a `Result`, never throws for an HTTP error, and checks the shape of each response.                |
| `src/store/`                                | Pinia stores. `board.ts` holds the board and runs each read and write; `settings.ts`, `theme.ts`, `tagFilter.ts`, and `search.ts` are small. |
| `src/composables/`                          | `useSyncLifecycle`: connects the board store to page events (tab hidden, page closing, back online, other tabs).                             |
| `src/components/`                           | The Vue components.                                                                                                                          |
| `src/markdown/`, `src/search/`, `src/tags/` | Markdown rendering, search matching and highlighting, tag helpers.                                                                           |
| `src/keywords/`                             | Keywords: get keywords from headlines, find keywords in a text, and add the keyword links to the rendered description.                       |

Libraries: `src/markdown/` renders Markdown with markdown-it (raw HTML off), sanitizes the result with
DOMPurify, and highlights code with the "common" language set of highlight.js.

Two patterns are used in each layer:

- **Branded types.** A value such as `Headline` or `ItemId` is a `string` with a type-only brand. The only
  way to get one is a factory in `src/domain/factories.ts`, which validates the value. So a `Headline` is
  always valid.
- **`Result` instead of exceptions.** A function that can fail returns `{ ok: true, value }` or
  `{ ok: false, error }` (`src/domain/result.ts`). The error types are unions, and ESLint checks each
  `switch` over them for completeness.

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
        409       → pendingCommands join the batch
                    → getFile → merge(base, ours, theirs) → putFile again
        temporary → keep the commands, retry later
        permanent → drop the in-flight commands
  → rebaseLocal: board = confirmed board + pendingCommands
```

The board that the user sees is the confirmed board (what GitHub has at `sha`) plus the commands that
are not saved yet. When the confirmed board changes, the store applies those commands again on top of the
confirmed board. If the new confirmed board contains a change from GitHub, a 3-way merge first checks the
commands against that change, and a conflict opens the conflict dialog.

## Procedures

### Add a command

1. Add the command to the `Command` type and handle the command in `applyCommand` (`src/domain/commands.ts`).
   If the command creates something new with a random id,
   let the command carry the id (like `add`), so that applying the command again gives the same result.
2. Add the commit message of the command in `src/format/commitMessage.ts`.
3. Check that `merge` (`src/domain/merge.ts`) handles the change that the command makes.
   If the command changes the file format, update `parse`, `serialize`, and the `file-format` spec.
4. Add tests in `tests/domain/`, `tests/format/`, and, for the UI, `tests/components/`.
5. Call `boardStore.applyAndSync(...)` from the component.

### Add a format version

Increase the format version only when the new app cannot read a file that the previous app wrote.
New optional syntax does not need a new format version.
An older app then rejects a file that uses the new syntax, and blocks each save.

1. Add the migration in `src/format/migrations/` and register the migration in `index.ts`.
   A migration is a pure function from text to text.
   A migration must not import the parser, the serializer, or
   `version.ts` (ESLint checks this), because a released migration never changes.
2. Increase `CURRENT_VERSION` in `src/format/version.ts`.
3. Copy the current valid fixtures to `tests/format/migrations/fixtures/v<old>/`, and add the expected
   output of the migration as `<name>.expected.md`.
   These fixtures are frozen.
4. Change `parse` and `serialize`, and update the grammar in the `file-format` spec.
5. Add a requirement with a scenario to the `file-format` spec for each change that the new migration makes,
   like the requirement "Tags in the migration from version 3".

## Developer notes

- The parser test fixtures in `tests/format/fixtures/` and the migration fixtures in
  `tests/format/migrations/fixtures/` must keep their exact bytes.
  Prettier skips them (see `.prettierignore`).
  Do not reformat them.
- The Content-Security-Policy in `index.html` is active in `pnpm dev` too.
  The policy blocks Vite's auto-reload connection and the favicon load over `http://`,
  so the browser console shows 2 warnings,
  and you must reload the page by hand after you save a file.
  The production build shows no warnings.
  Do not relax the policy for development.
- `playwright.config.ts` sets `WAYLAND_DISPLAY=none` for the test browser.
  Without it, on WSL2, the first e2e test can time out,
  because Chromium waits for the WSLg Wayland compositor.
  Keep the setting.
- Pins:
  - **TypeScript** stays on 6.x until `vue-tsc` and `typescript-eslint` support TypeScript 7.
  - **@types/node** stays on the major version that matches the Node version in `.nvmrc`.
