# Learning Tracker

A single-page Vue 3 + TypeScript app for tracking learning topics through four states —
**New → WIP → Complete**, with **Discarded** as a side exit — stored as one Markdown file in a
private GitHub repository and edited through the GitHub Contents API. No backend; the app runs
entirely in the browser and is hosted on GitHub Pages.

See [`Plan.md`](./Plan.md) for the full design rationale.

## Setup

1. Create a private repository (e.g. `learning-data`) with a `learning.md` file — an empty one
   works; the app can also create it for you on first run.
2. Create a fine-grained GitHub personal access token scoped to just that repository, with
   **Contents: Read and write** and nothing else.
3. Run the app (`pnpm dev`, or the deployed Pages URL) and fill in the setup screen: owner, repo,
   branch, path, and the token. "Test connection" verifies read access before you save.

## Development

```sh
pnpm install
pnpm dev          # local dev server
pnpm lint         # eslint --max-warnings 0
pnpm typecheck    # vue-tsc -b --noEmit
pnpm test         # vitest run
pnpm build        # production build (also runs vue-tsc -b)
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, test, and build on every push and PR.
`.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on pushes to `main`.

The Pages base path defaults to `/learning-tracker/` (see `vite.config.ts`); override with the
`VITE_BASE` env var if the repository is renamed.

**Dev-mode quirk:** the CSP meta tag in `index.html` (see below) applies in `pnpm dev` too, and it
correctly blocks Vite's own HMR websocket and the `http://` favicon fetch as a side effect — you'll
see two CSP console warnings locally that don't occur in the production build. Auto-reload-on-save
doesn't work under this CSP; refresh manually while developing. This is deliberate: it's the same
"deny by default, allow only api.github.com" policy the app relies on in production, verified by
running the app in a browser rather than relaxed away for convenience.

## The `learning.md` file grammar

The file is hand-editable, but the parser is strict: anything it did not write itself is a parse
error, never a silent reinterpretation. This is deliberate — a hand-edit mistake should be loud,
not lose data quietly.

```
file        := header section('New') section('WIP') section('Complete') section('Discarded')
header      := '# Learning' NL blank* '<!-- learning-tracker: v1 — …' NL blank*
section(S)  := '## ' S NL blank* item*
item        := '### ' headline NL
               '<!-- ' meta (' ' meta)* ' -->' NL
               desc?
               blank*
meta        := 'id:' ULID | 'created:' DATE | 'completed:' DATE | 'discarded:' DATE
desc        := '<!-- desc -->' NL rawline* '<!-- /desc -->' NL
rawline     := any line that is not exactly '<!-- /desc -->'
blank       := an empty line (outside desc blocks)
```

Rules:

- The header line and the `learning-tracker: v1` comment must match exactly what the app writes.
- Sections must appear in the order New, WIP, Complete, Discarded — all four, always, even if empty.
- Inside a `<!-- desc -->` … `<!-- /desc -->` block, **nothing is interpreted** — headings, `##`,
  code fences, other HTML comments, blank lines — it's all raw text. Only the exact line
  `<!-- /desc -->` closes the block.
- A description can therefore never contain the literal string `<!-- /desc -->`; the app rejects
  that at input time with a clear message.
- Headlines are single-line and can't contain `<!--`.
- An active item's file section (New vs. WIP) is derived from whether it has a description. If a
  hand-edit puts it under the wrong one, the app treats it as a **warning**, not an error — it
  loads fine and normalises the placement on the next write.
- A `Complete` item must have both a `completed:` date and a description — completing without
  notes would be silently lossy, so it's a hard error instead.
- An item cannot have both `completed:` and `discarded:` metadata; duplicate `id`s across the
  whole file are rejected.
- Line endings: the app always writes `\n`; `\r\n` is accepted on read and normalised.

Before every write, the app re-parses what it's about to save and compares it against the in-memory
board. If they don't match, the write is aborted and nothing is committed — the round-trip gate
described in `Plan.md` §5.4, exercised continuously by
`tests/format/roundtrip.property.test.ts`.

If the file fails to parse (e.g. after a hand-edit gone wrong), the app shows the parse error with
a line number, links to the file on github.com, and blocks all writes until it's fixed. Git history
has the last good version.
