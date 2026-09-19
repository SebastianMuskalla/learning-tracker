# Requirement 3: Tags

Status: implemented.

## 1. What is asked

- Each item can have 0, 1, or more tags.
- A tag is one word (no spaces) and a hex color.
- The list of tags is stored in `learning.md`. Which tags an item has is
  also stored in `learning.md`.
- On the settings page, the user can create a tag, change its color, and
  delete a tag. Creating a tag does not change any item. Deleting a tag
  removes it from every item that has it, after a confirmation dialog.
- When creating a tag, the user picks one of 16 pastel colors that fit the
  theme of the page. The color can be changed later.
- In the detail drawer, above the description, all tags are shown as chips.
  Chips of tags the item has are shown in full color; the other chips are
  grayed out. Clicking a chip adds or removes the tag on the item.
- Items created before tags existed must keep working.
- At the top of the board, below the header bar and above the "New" column,
  all tags are shown as chips. Clicking a chip toggles it between inactive
  (default, normal look) and active (highlighted look). Several chips can be
  active at the same time.
- While at least one tag is active, only items that have at least one of the
  active tags are shown. The count in each column header then reads
  "x of y": y is the total number of items in that column, x is the number
  shown.
- Which tags are active is stored in the browser, not in `learning.md`.

## 2. Where the relevant code is today

- [`src/domain/types.ts`](../src/domain/types.ts) — `Item`, `Board`, and the
  branded primitives. `Board` has exactly the four item lists.
- [`src/domain/factories.ts`](../src/domain/factories.ts) — validation of
  primitives (`makeHeadline`, `makeIsoTimestamp`, …) and `ValidationError`.
- [`src/domain/commands.ts`](../src/domain/commands.ts) — the `Command` union
  and `applyCommand`. Every change to the board goes through here.
- [`src/domain/board.ts`](../src/domain/board.ts) — `emptyBoard`,
  `validateBoard`, `boardsEqual`, `itemsEqual`.
- [`src/domain/merge.ts`](../src/domain/merge.ts) — the 3-way merge used when
  a write races a remote change. It merges items by id.
- [`src/format/parse.ts`](../src/format/parse.ts) and
  [`src/format/serialize.ts`](../src/format/serialize.ts) — the strict file
  format. The item metadata line is parsed with `META_RE`.
- [`src/format/commitMessage.ts`](../src/format/commitMessage.ts) — one
  commit message per command.
- [`src/store/board.ts`](../src/store/board.ts) — `applyAndSync(command)`,
  debounced batches, the round-trip gate, and conflict handling. `load()`
  always reloads from GitHub; `refresh()` skips itself while there is
  unwritten work.
- [`src/store/search.ts`](../src/store/search.ts) — the small Pinia store for
  the search term. The tag filter store follows the same shape.
- [`src/components/BoardView.vue`](../src/components/BoardView.vue) — builds
  `visibleBoard` from the search filter and passes it to the columns; owns the
  drawer and all command handlers.
- [`src/components/SectionColumn.vue`](../src/components/SectionColumn.vue) —
  shows `items.length` in the header; disables drag-and-drop while
  `dragDisabled` is true.
- [`src/components/ItemDetailDrawer.vue`](../src/components/ItemDetailDrawer.vue)
  — the edit mode. The tag chips go between the dates and the "Description"
  heading. It already has a confirmation overlay (for delete) whose styles
  can be reused.
- [`src/components/SetupView.vue`](../src/components/SetupView.vue) — the
  settings page. It replaces `BoardView` while open (`App.vue` shows one or
  the other), so `BoardView` is unmounted and runs `boardStore.load()` again
  when it comes back. See section 3.7 for why this matters.
- [`src/styles/base.css`](../src/styles/base.css) — the color tokens for
  light and dark mode.

## 3. Design decisions

### 3.1 File format: tag definitions after the header, tags in the item metadata

Tag definitions are comment lines directly after the version comment, one
tag per line, in display order:

```
# Learning

<!-- learning-tracker: v1 — edit by hand at your own risk; the app validates strictly -->

<!-- tag:vue color:#aacbee -->
<!-- tag:rust color:#f6c9a4 -->

## New

### Learn Vue composables
<!-- id:01M2KCX2QA8VMTXY950V44DB2J created:2026-09-16T14:32:07Z tags:vue,rust -->
```

An item's tags are a new, optional `tags:` part at the end of its metadata
comment: the tag names, separated by commas, no spaces. An item with no
tags has no `tags:` part at all.

Why this format:

- **Backward compatible.** A file with no tag definitions and no `tags:`
  parts is exactly the current format. Every existing file parses unchanged,
  and every existing item is read as "no tags". Nothing needs a migration.
  The version stays `v1` for the same reason: the new format is a superset,
  and an older app version that meets a tagged file fails with a clear parse
  error and blocks writes, which is the existing "no silent data loss" rule.
- **Same style as the item metadata.** `key:value` inside an HTML comment is
  what the file already uses, so hand edits follow one pattern.
- **Definition order is display order.** The chips in the filter bar, in the
  drawer, and on the settings page follow the order of the definition lines.
  A new tag is appended at the end. There is no reorder feature.

Why not a `## Tags` section: the parser expects the four item sections in a
fixed order, and a visible heading whose only content is hidden comments
looks broken in GitHub's rendered view. Comment lines are invisible there,
like all other metadata in this file.

Parser rules (all errors, in the spirit of the strict parser):

- The tag name must match `^[\p{L}\p{N}_-]{1,32}$` (`u` flag): letters,
  digits, `_`, `-`; no spaces, no commas, no `<` or `>`. Umlauts and other
  scripts are allowed, like in headlines.
- The color must match `^#[0-9a-fA-F]{6}$`. It is kept as written (like
  timestamps), not normalised. The app itself always writes lower case.
- Two definitions with the same name (compared ignoring case, so `Vue` and
  `vue` cannot both exist) → error `Duplicate tag "vue"`.
- An item that lists a tag that is not defined → error
  `Unknown tag "vue" on item "…"`. A warning-and-drop would silently lose a
  hand-typed tag; an error keeps the data.
- The same tag twice on one item → error.
- Blank lines between definition lines are allowed; the serializer writes
  them without blank lines and one blank line after the block.

Serializer: writes the definition lines in list order, then the items with
`tags:` appended when the list is not empty. The round-trip gate in the
store (`parse(serialize(board))` must equal `board`) keeps working, because
both sides keep the stored order and the stored color string.

### 3.2 Domain model

```ts
export type TagName = string & { readonly __brand: 'TagName' };
export type HexColor = string & { readonly __brand: 'HexColor' };

export interface Tag {
  readonly name: TagName;
  readonly color: HexColor;
}

export interface ItemBase {
  readonly id: ItemId;
  readonly headline: Headline;
  readonly createdAt: IsoTimestamp;
  readonly tags: readonly TagName[]; // new; [] when the file has no tags: part
}

export interface Board {
  readonly tags: readonly Tag[]; // new
  readonly new: readonly ActiveItem[];
  // ...
}
```

`tags` on `ItemBase` is always present in memory. "Existing items" is not a
special case anywhere except the parser, which maps a missing `tags:` part
to `[]`.

New factories in `factories.ts`: `makeTagName(raw)` (trims, validates the
pattern) and `makeHexColor(raw)`. New `ValidationError` members
`InvalidTagName` and `InvalidHexColor`.

An item's tag list is kept in **definition order**. `tagItem` inserts at the
right position instead of appending, so the file is deterministic no matter
in which order the user clicked. The parser keeps whatever order the file
has (a hand edit with a different order is not an error; it stays as it is
until the item's tags change).

`validateBoard` gets three more checks: no duplicate tag names (ignoring
case), every item tag is defined, no duplicate tags on one item.
`emptyBoard()` returns `tags: []`. `boardsEqual` also compares the tag
lists; `itemsEqual` also compares `tags` element by element.

### 3.3 Commands

Five new commands in `commands.ts`:

| Command                       | Effect                                                                                      | Error cases                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `createTag { name, color }`   | Appends the tag to `board.tags`. Items are untouched.                                       | `TagAlreadyExists` (name, ignoring case)          |
| `setTagColor { name, color }` | Replaces the color of the tag with that name.                                               | `TagNotFound`                                     |
| `deleteTag { name }`          | Removes the definition and removes the name from `tags` of every item in all four sections. | `TagNotFound`                                     |
| `tagItem { id, tag }`         | Adds the tag to the item, in definition order.                                              | `ItemNotFound`, `TagNotFound`, `TagAlreadyOnItem` |
| `untagItem { id, tag }`       | Removes the tag from the item.                                                              | `ItemNotFound`, `TagNotOnItem`                    |

Two separate commands for tag/untag (rather than one `toggleTag`) give
precise commit messages and keep the command log honest. The UI decides
which one to send from the item's current state, so the "already on item"
errors are only reached by a stale click, which the store then reports like
any other domain error.

Commit messages in `commitMessage.ts`:

- `Create tag "vue"`
- `Recolor tag "vue"`
- `Delete tag "vue"`
- `Tag "Learn Vue composables" with "vue"`
- `Untag "Learn Vue composables" from "vue"`

`commandItemId` in the store already picks up `id` from a command, so the
tag/untag messages get the headline for free. `domainErrorMessage` in the
store gets the new error types.

### 3.4 Merge

`merge.ts` merges items by id. The tag list is merged the same way, by name:

- a tag added on one side is kept;
- a tag deleted on either side (relative to `base`) is dropped — delete
  wins, same as for items;
- a tag whose color changed on one side takes that side's color;
- a color changed differently on both sides → new conflict type
  `DivergentTagEdit { name }`, handled by the same conflict dialog. The
  `ConflictBanner` gets one extra line per version: `Tags: vue, rust` under
  the item lists, so the user can see what differs.

Order of the merged tag list follows `remote`, with local-only additions
inserted after their nearest local predecessor, reusing `orderSection`'s
approach.

After items and tags are merged, one more pass removes from every item any
tag that is not in the merged tag list. This is what makes "tag deleted
here, item tagged with it there" resolve without a conflict: the delete
wins and the item loses the tag. Item tags are compared as part of
`itemsEqual`, so "tagged here, headline edited there" on the same item is a
`DivergentEdit` like any other two-sided change of one item; this is the
existing rule and not worth a special case.

### 3.5 Tag colors and the chip

**Palette.** A constant `TAG_PALETTE` in `src/tags/palette.ts` with 16
entries `{ name, color }`. The colors are pastels with the same warm,
slightly desaturated feel as the existing tokens (`--bg: #f7f7f5`,
`--accent: #3a6b52`, the column tints). Proposed values, hue-ordered:

| name   | color     | name   | color     |
| ------ | --------- | ------ | --------- |
| red    | `#f4b8b0` | teal   | `#a9dccf` |
| orange | `#f6c9a4` | cyan   | `#a6d8e6` |
| amber  | `#f5d89a` | sky    | `#aacbee` |
| yellow | `#efe39a` | blue   | `#b3bdee` |
| lime   | `#d5e3a0` | indigo | `#c4b8ea` |
| green  | `#b9dcb8` | violet | `#d8b8e6` |
| brown  | `#d9c3ad` | pink   | `#f0b8d6` |
| gray   | `#cfcac2` | rose   | `#f2bcc4` |

The values are a starting point; the implementation checks each one against
the ink color below for a contrast ratio of at least 4.5:1 and adjusts if
needed. The palette is UI-only: the file accepts any `#rrggbb`, so a hand
edit can use a color outside the palette, and the app keeps it.

**Chip.** One presentational component `TagChip.vue`, used in the filter
bar, the drawer, and the settings page. Props: `name`, `color`, `mode:
'normal' | 'muted' | 'active'`, `interactive: boolean`. It renders a
`<button type="button">` when interactive (with `aria-pressed` for the
active/assigned state) and a `<span>` otherwise. The color goes in as a CSS
custom property (`style="--tag-color: #aacbee"`), so all looks are pure CSS:

- `normal`: `background: var(--tag-color); color: var(--tag-ink)`, pill
  shape (`border-radius: 999px`), small font (`0.8rem`), 1px transparent
  border so the size never changes between modes.
- `muted` (drawer, tag not on the item): `filter: grayscale(1); opacity:
0.55`. On hover the filter drops to `grayscale(0.4)` and the cursor is a
  pointer, so the chip reads as clickable. Same size and text as normal.
- `active` (filter bar): a ring, `box-shadow: 0 0 0 2px var(--surface), 0 0
0 4px var(--text)`, `font-weight: 600`, and a small check icon
  (`fa-check`) before the name, so the state is visible without color.

`--tag-ink` is one new token in `base.css`: `#1d1b18` in both light and dark
mode. The pastels are light, so the same dark ink works on them in both
themes; a chip in dark mode looks like a light label on a dark surface,
which is what most apps do. `--tag-color` is set inline per chip and is
not a theme token.

### 3.6 Drawer: assign and remove tags

`ItemDetailDrawer` gets a new prop `tags: readonly Tag[]` (the board's
list, passed by `BoardView` like `item`) and a new emit
`toggleTag: [tag: TagName]`. Between the `<dl class="dates">` and the
`<h3>Description</h3>`, a row `div.tags` renders one `TagChip` per defined
tag, in definition order, `mode="normal"` when `item.tags` includes the
name and `mode="muted"` otherwise. Clicking a chip emits `toggleTag`.
`BoardView` turns that into `tagItem` or `untagItem` based on
`selectedItem.tags` at that moment.

When `tags` is empty, the row shows one muted line instead: "No tags yet —
create tags in the settings." A heading is not needed; the chips are
self-explanatory, and the row stays compact.

The drawer is re-rendered from the store after each command, so the chip
switches mode as soon as the command is applied locally (before the
commit), like every other edit.

### 3.7 Settings page: create, recolor, delete

`SetupView` gets a new block "Tags" under the repository links. It is shown
only when the board is usable: `closable && boardStore.sha !== null &&
boardStore.canWrite && !boardStore.fileNotFound`. During first setup, or
while the file has a parse error, the block is not shown (an explanation
line replaces it in the parse-error case: "Fix learning.md before editing
tags.").

Contents:

- **Existing tags**, one row per tag: the `TagChip` (non-interactive), the
  usage count ("used by 3 items"), a color button that opens the 16-swatch
  picker inline, and a delete button.
- **New tag**: a text input (`maxlength="32"`, `pattern` matching the tag
  name rule, `aria-label="New tag name"`), the swatch picker, and an "Add"
  button. The name is validated with `makeTagName`; a duplicate (ignoring
  case) or an invalid name shows an inline error, the same style as the
  existing `.error` lines. The picker preselects the first palette color
  that no existing tag uses, falling back to the first color.
- **Swatch picker**: a 16-cell grid of round buttons, each
  `aria-label="<palette name>"`, `title` the same, and the selected one
  gets the same ring as an active chip. It is a small component
  `ColorSwatchPicker.vue` with `v-model` on the hex string, used for
  creating and for recoloring.
- **Delete confirmation**: the same overlay pattern as the delete dialog in
  `ItemDetailDrawer` (copy the markup and styles; a shared `ConfirmDialog`
  component can be extracted later if a third use appears). Text: `Delete
tag "vue"?` and `It is used by 3 items. They will lose this tag.` (or
  `No item uses it.`). Buttons: Cancel, Delete tag. `Escape` closes the
  dialog first, then the settings page, mirroring the drawer's handling.

All three actions call `boardStore.applyAndSync` with the commands from
section 3.3. The usage count comes from `allItems(boardStore.board)`.

**Pending work when leaving the settings page.** `applyAndSync` applies the
command locally at once and writes after a quiet period of 800 ms.
`BoardView` runs `boardStore.load()` in `onMounted`, and `load()` reloads
from GitHub unconditionally. So: create a tag, close settings within 800
ms, `BoardView` mounts, `load()` runs before the pending flush, and the
reload replaces the local board — the new tag is lost. Two small changes
close this gap:

1. `load()` in the store first flushes pending work, then reloads:
   `enqueue(async () => { await flushPending(); await performLoad(); })`.
   This protects every current and future caller of `load()`.
2. `SetupView.save()` awaits a new `boardStore.flushNow()` (which is
   `enqueue(() => flushPending())`) **before** `settings.updateRepoSettings`,
   so a pending batch is written to the repository it was made for, not to
   a repository the user just switched to in the same visit.

### 3.8 Filter bar and filtering

New component `TagFilterBar.vue`, rendered in `BoardView` right before
`<main class="columns">`, inside the same `max-width: 48rem` centering so it
aligns with the columns. It is not rendered when the board has no tags (an
empty strip would only take space) or when the file is missing. It is a
`flex-wrap` row of interactive `TagChip`s, `mode="active"` for active tags
and `mode="normal"` otherwise, with `aria-label="Filter by tag"` on the row.

**Filter state** lives in a new Pinia store `useTagFilterStore`
(`src/store/tagFilter.ts`), shaped like the search store:

- `activeNames: Set<TagName>` (as a `ref`), `isActive` (`size > 0`),
  `toggle(name)`, `clear()`.
- It is **persisted in `localStorage`** under `learning-tracker:active-tags`
  as a JSON array. "Stored in the browser, not in the markdown" is read as
  "survives a reload", which is also convenient: the user comes back to the
  same filtered view. Reads and writes are wrapped in `try/catch`, like the
  settings store handles a corrupt blob.
- Stale names (a tag deleted or renamed by hand since the filter was set)
  are ignored at use time: `BoardView` computes `effectiveActive =
activeNames ∩ board.tags`. They are not cleaned from storage; the next
  `toggle` rewrites the set anyway. `isActive` is defined on the effective
  set, so a stored name that no longer exists never hides items.

**Filtering.** A pure function in `src/tags/filter.ts`:

```ts
itemHasAnyTag(item: { tags: readonly TagName[] }, active: ReadonlySet<TagName>): boolean
```

`BoardView.filterSection` becomes: keep an item when it matches the search
term (if a search is active) **and** has any active tag (if the tag filter
is active). Both filters compose. The search bar's own "x out of y" counter
keeps its current meaning (y = all items on the board); x is the number of
items that pass both filters, which is what the user sees on the board.

**Column counts.** `SectionColumn` gets a new prop `totalCount: number`
(the unfiltered length, `boardStore.board[section].length`) next to the
visible `items`. The header shows `items.length` when
`items.length === totalCount` and no filter is active, and `x of y` when a
filter is active. This is done for the tag filter as asked; it also
applies to the search filter, because "5 of 12" during a search is
strictly more informative than "5", and two different count styles for two
filters would look like a bug. If the search should keep its plain number,
this is a one-line condition on `tagFilter.isActive` instead of "any
filter" — noted here so it is a deliberate choice.

**Drag-and-drop** is disabled while the tag filter is active, for the same
reason as during a search (indices no longer match the full section):
`:drag-disabled="searchStore.isActive || tagFilter.isActive"`.

### 3.9 Keyboard and accessibility

- Chips are real buttons, so Tab and Space/Enter work without extra code.
- The global `n` shortcut ignores key presses in inputs; the tag name input
  on the settings page is an input, so typing `n` there is fine. Chips are
  buttons, not inputs, and the settings page is not mounted together with
  `BoardView`, so no shortcut conflict exists there.
- The filter bar has `aria-pressed` on each chip; the count text in a
  column header already updates visibly, and gets `aria-live="polite"` so
  screen readers hear "3 of 12".

## 4. Files to add or change

| File                                                                                                                                    | Change                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/domain/types.ts`                                                                                                                   | `TagName`, `HexColor`, `Tag`; `tags` on `ItemBase`; `tags` on `Board`.                                                                           |
| `src/domain/factories.ts`                                                                                                               | `makeTagName`, `makeHexColor`, two new `ValidationError` members.                                                                                |
| `src/domain/commands.ts`                                                                                                                | Five new commands, four new `DomainError` members, `tagItem` inserts in definition order, `add` sets `tags: []`, status changes copy `tags`.     |
| `src/domain/board.ts`                                                                                                                   | `emptyBoard` with `tags: []`; three new checks in `validateBoard`; `boardsEqual` and `itemsEqual` compare tags.                                  |
| `src/domain/merge.ts`                                                                                                                   | Merge the tag list by name; `DivergentTagEdit`; strip deleted tags from items after the merge.                                                   |
| `src/format/parse.ts`                                                                                                                   | Parse tag definition lines after the header; `tags:` group in `META_RE`; the new error cases from section 3.1.                                   |
| `src/format/serialize.ts`                                                                                                               | Write definition lines and the `tags:` part.                                                                                                     |
| `src/format/commitMessage.ts`                                                                                                           | Messages for the five commands.                                                                                                                  |
| `src/tags/palette.ts` (new)                                                                                                             | `TAG_PALETTE`, 16 `{ name, color }` entries.                                                                                                     |
| `src/tags/filter.ts` (new)                                                                                                              | `itemHasAnyTag`. Pure, no Vue.                                                                                                                   |
| `src/store/tagFilter.ts` (new)                                                                                                          | Pinia store: active set, `toggle`, `clear`, `localStorage` persistence.                                                                          |
| `src/store/board.ts`                                                                                                                    | `load()` flushes first; `flushNow()`; `domainErrorMessage` for the new errors.                                                                   |
| `src/components/TagChip.vue` (new)                                                                                                      | The chip (section 3.5).                                                                                                                          |
| `src/components/ColorSwatchPicker.vue` (new)                                                                                            | The 16-swatch picker.                                                                                                                            |
| `src/components/TagFilterBar.vue` (new)                                                                                                 | The row of filter chips (section 3.8).                                                                                                           |
| `src/components/BoardView.vue`                                                                                                          | Render `TagFilterBar`; combine both filters in `visibleBoard`; pass `total-count` and `tags`; handle `toggleTag`; drag disabled while filtering. |
| `src/components/SectionColumn.vue`                                                                                                      | `totalCount` prop; "x of y" header.                                                                                                              |
| `src/components/ItemDetailDrawer.vue`                                                                                                   | `tags` prop, chip row, `toggleTag` emit.                                                                                                         |
| `src/components/SetupView.vue`                                                                                                          | The "Tags" block with list, recolor, create, delete confirmation; `flushNow()` before `updateRepoSettings`.                                      |
| `src/components/ConflictBanner.vue`                                                                                                     | Show each version's tag list.                                                                                                                    |
| `src/styles/base.css`                                                                                                                   | `--tag-ink` token.                                                                                                                               |
| `tests/format/fixtures/*.md`, `tests/format/parse.test.ts`, `tests/format/serialize.test.ts`, `tests/format/roundtrip.property.test.ts` | See section 5.                                                                                                                                   |
| `tests/domain/commands.test.ts`, `tests/domain/board.test.ts`, `tests/domain/merge.test.ts`, `tests/domain/factories.test.ts`           | See section 5.                                                                                                                                   |
| `tests/tags/filter.test.ts`, `tests/store/tagFilter.test.ts`, `tests/store/board.test.ts` (new / extended)                              | See section 5.                                                                                                                                   |
| `README.md`                                                                                                                             | New "Tags" section; grammar and rules in "The `learning.md` file format"; remove "Tags" from "Future ideas".                                     |

## 5. Tests

`tests/domain/factories.test.ts`:

- `makeTagName`: accepts `vue`, `c-sharp`, `web_dev`, `Übung`, `日本語`;
  trims; rejects empty, a space inside, a comma, `<!--`, 33 characters.
- `makeHexColor`: accepts `#aacbee` and `#AACBEE` (kept as given); rejects
  `aacbee`, `#abc`, `#gggggg`.

`tests/format/parse.test.ts` and new fixtures:

- `tags.md` (valid): two definitions, items with zero, one, and two tags,
  a blank line between definition lines. Parsed board has the tags in file
  order; the untagged item has `tags: []`.
- `valid.md` (existing, no tags at all) still parses; every item has
  `tags: []`; `board.tags` is `[]`.
- Error fixtures, one each: unknown tag on an item, duplicate definition
  (`vue` and `Vue`), invalid color, invalid name (contains a space), same
  tag twice on one item, a definition line after `## New`.

`tests/format/serialize.test.ts`:

- A board with no tags serializes byte-for-byte as before (no new lines).
- Definition lines come directly after the version comment, then one blank
  line, then `## New`.
- An item with tags gets ` tags:a,b` at the end of its metadata; an item
  without tags gets no `tags:` part.

`tests/format/roundtrip.property.test.ts`:

- Extend `arbitraryBoard` with an arbitrary tag list (0–4 tags, unique
  names ignoring case, colors from the palette plus a few upper-case hex
  values) and give each item an arbitrary subset of those names in
  definition order. The existing property `parse(serialize(b)) equals b`
  then covers tags as well.

`tests/domain/board.test.ts`:

- `validateBoard` rejects an item with an undefined tag, a duplicate tag
  name (ignoring case), and a duplicate tag on one item.
- `boardsEqual` sees a difference in the tag list and in an item's tags.

`tests/domain/commands.test.ts`:

- `createTag` appends; the items are the same objects as before; duplicate
  name (ignoring case) → `TagAlreadyExists`.
- `setTagColor` replaces only the color; unknown name → `TagNotFound`.
- `deleteTag` removes the definition and the name from items in all four
  sections, leaves other tags on those items in place; unknown name →
  `TagNotFound`.
- `tagItem` inserts in definition order (tag `b` then `a` yields `[a, b]`);
  unknown tag → `TagNotFound`; twice → `TagAlreadyOnItem`.
- `untagItem` removes; not on the item → `TagNotOnItem`.
- `complete`, `uncomplete`, `discard`, `restore` keep the item's tags.
- `add` creates the item with `tags: []`.

`tests/domain/merge.test.ts`:

- A tag added on one side is kept; added on both with the same color is
  kept once; added on both with different colors → `DivergentTagEdit`.
- A tag deleted locally and used remotely on an item: the merged board has
  neither the definition nor the tag on the item, and no conflict.
- A color changed on one side wins; changed differently → conflict.
- The existing identity properties (`merge(b, b, r) = r`, `merge(b, l, b) =
l`) hold with tags in the arbitrary boards.

`tests/tags/filter.test.ts`:

- `itemHasAnyTag` with an empty active set is not called by the UI, but
  returns `false` (documented); one matching tag → `true`; no overlap →
  `false`; an item with `tags: []` → `false`.

`tests/store/tagFilter.test.ts` (jsdom `localStorage`):

- `toggle` adds then removes; `clear` empties; the set is written to
  `localStorage` and read back by a fresh store; a corrupt value falls back
  to an empty set.

`tests/store/board.test.ts` (extend):

- `load()` with pending work: the pending batch is written (one `putFile`)
  before the `getFile` of the reload, and the reloaded board contains the
  change.
- `flushNow()` writes immediately and resolves after the write.

`tests/format/commitMessage.test.ts` (new, small): one case per new command.

Manual checks:

- Create a tag on the settings page and close the page immediately: the
  tag is still there and one commit "Create tag …" appears in the history.
- Recolor a tag: the chips update in the filter bar and in an open drawer.
- Delete a tag that is used by items: the confirmation shows the right
  count; after confirming, the items lose only that tag and the commit
  message is "Delete tag …".
- In the drawer, click a muted chip and a colored chip; the file on GitHub
  gets `tags:` in definition order.
- A file written by the current app version (no tags) loads without a
  warning; a file with tags edited by hand to have `tags:Vue` while the
  definition says `vue` shows a parse error with the line number.
- Filter bar: activate two tags; only items with either tag are visible,
  headers show "x of y"; drag handles are hidden; a search on top narrows
  further; reload keeps the active tags.
- Light and dark mode: normal, muted, and active chips are distinguishable
  on the surface, on the tinted columns, and on the settings card.

## 6. Risks and trade-offs

- **Strict parse errors for unknown tags.** A hand edit that removes a
  definition line while items still reference the name blocks the app until
  the file is fixed. This is the same trade-off the file format makes
  everywhere: a clear error beats silent loss. The error message names the
  tag and the item so the fix is quick.
- **Case-insensitive uniqueness, case-sensitive storage.** `vue` and `Vue`
  cannot both exist, but the chip shows the name as typed. Comparing names
  exactly everywhere else (item `tags:`, filter set) is simpler and never
  ambiguous because uniqueness is enforced at definition time.
- **Pastel chips in dark mode** are light labels on a dark surface. If this
  looks too bright, the alternative is `background: color-mix(in srgb,
var(--tag-color) 35%, var(--surface)); color: var(--tag-color)` in dark
  mode only. It is a CSS-only change inside `TagChip.vue`.
- **`load()` now flushes first.** A reload right after an edit costs one
  write before the read. That is the correct order (local work must not be
  thrown away by a reload) and it only happens when there is unwritten work.
- **The tag filter is persisted.** A user who forgets an active filter sees
  fewer items after a reload. The filter bar is always visible when tags
  exist and active chips are strongly highlighted, so this is discoverable.
  If it turns out to be annoying, switching to `sessionStorage` is a
  one-word change in the store.
- **`itemsEqual` now includes tags**, so a tag change on one side and any
  other edit of the same item on the other side is a conflict. This matches
  how the merge treats every other field; a finer field-level merge is not
  worth its complexity for a single-user app.

## 7. Suggested order

1. Domain: types, factories, `board.ts`, commands, and their tests. This
   compiles on its own (with `tags: []` added where the compiler asks).
2. Format: parser, serializer, fixtures, round-trip property test. After
   this step the file can carry tags end to end.
3. Merge and commit messages, with tests.
4. Store: `load()` flush, `flushNow()`, error messages, tests.
5. `TagChip`, `ColorSwatchPicker`, and the settings page block. Tags can now
   be created and deleted.
6. Drawer chips and `toggleTag` wiring in `BoardView`.
7. Tag filter store, `TagFilterBar`, combined filtering, "x of y" counts,
   drag disabling.
8. `ConflictBanner` tag lines, `--tag-ink` token, README, manual checks.

## 8. Documentation to update

[`README.md`](../README.md):

- A new "Tags" section after "Search": what a tag is, where to create one
  (settings page), the 16 colors, the chips in the drawer, the filter bar,
  "x of y", and that the active filter is remembered by the browser only.
- In "The `learning.md` file format": add `tagdef` lines to the grammar
  (`header := … blank* tagdef*`, `tagdef := '<!-- tag:' NAME ' color:#' HEX6 ' -->' NL blank*`),
  add `'tags:' NAME (',' NAME)*` to `meta`, and three rules: the name
  pattern, "every tag on an item must be defined above", and "a file with
  no tag lines is still valid".
- Remove "Tags" from "Future ideas".

## 9. Not in this plan

- Tag chips on the cards in the list view. Not asked; easy to add later by
  rendering `TagChip` (non-interactive, small) under the headline in
  `ItemCard`.
- Renaming a tag. Not asked. It would be one more command that also rewrites
  every item's `tags:` part.
- A "clear all filters" button in the filter bar. Clicking each active chip
  again does the same.
- Custom colors outside the 16 swatches in the UI. The file accepts any hex
  color, so a hand edit can set one.
