# Requirement 2: Search

Status: analysis and plan. Nothing is implemented yet.

## 1. What is asked

- A floating search bar in the bottom-left corner of the board.
- `Ctrl+F` or `Ctrl+K` focuses the search bar. When the search bar already
  has focus, the same keys do what the browser normally does.
- While the search bar is not empty:
  - it shows "x out of y items", where x is the number of items that match
    and y is the total number of items;
  - it shows an X button that clears it;
  - only matching items are shown on the board.
- An item matches when the search term occurs in its headline or its
  description.
- Matching is a little fuzzy: it ignores case, and it ignores spaces, line
  breaks, and punctuation between the letters. So `some text` matches
  `Some Text`, `sometext`, `some-text`, `some. text`, `some; text`, and
  `some\n    text`.
- The matched text is highlighted with a colored background, in the headline
  and in the description. This works in the list view and while the detail
  drawer (edit mode) is open. Typing in the search bar must not open or close
  the drawer.
- A description hit that is not inside the short preview on the card must
  still be visible to the user in some way.

## 2. Where the relevant code is today

- [`src/components/BoardView.vue`](../src/components/BoardView.vue) — owns the
  board layout, the global keyboard handler (`onGlobalKeydown`: `n` focuses
  the add input, `Escape` closes the drawer), and passes each section's items
  to a `SectionColumn`.
- [`src/components/SectionColumn.vue`](../src/components/SectionColumn.vue) —
  renders one column and handles drag-and-drop with `VueDraggable`. It emits
  `reorder(fromIndex, toIndex)` with indices into the list it was given.
- [`src/components/ItemCard.vue`](../src/components/ItemCard.vue) — shows the
  headline as a `<span>` and a description preview that is clipped to four
  lines with `max-height` and a fade-out mask.
- [`src/components/ItemDetailDrawer.vue`](../src/components/ItemDetailDrawer.vue)
  — the edit mode. It shows the headline in an `<input>` and the description
  either as a static rendered preview or as a textarea next to a live
  preview. After each render it runs `highlightCodeBlocks` (highlight.js) on
  the preview DOM. It only highlights blocks with a known language and skips
  blocks that are already highlighted, so it is safe to call again.
- [`src/markdown/render.ts`](../src/markdown/render.ts) — `renderMarkdown`
  (markdown-it + DOMPurify) and `highlightCodeBlocks`.
- [`src/components/SyncStatusOverlay.vue`](../src/components/SyncStatusOverlay.vue)
  — a floating box in the bottom-right corner. The search bar is its mirror
  image on the left and should reuse the same look.
- [`src/store/board.ts`](../src/store/board.ts) — the board data. The search
  does not touch it.

## 3. Design decisions

### 3.1 Matching: normalize, then plain substring search

The fuzzy rules all come down to one idea: compare the text with everything
that is not a letter or a digit removed, and with all letters in lower case.

```
normalize("Some. Text\n  here") === "sometexthere"
normalize("some text")          === "sometext"
```

An item matches when `normalize(headline)` or `normalize(description)`
contains `normalize(term)`. This is a plain `String.prototype.includes`, no
regular expression is built from user input, so no escaping problems.

Details:

- "Letter or digit" means the Unicode classes `\p{L}` and `\p{N}` (regular
  expression with the `u` flag). This keeps umlauts, accents, and non-Latin
  scripts working. Everything else (spaces, line breaks, `-`, `.`, `;`,
  Markdown syntax such as `*` and `#`, and so on) is dropped.
- Lower-casing is done per code point, not on the whole string, so that the
  index map below stays correct when one character becomes two (rare, but
  real, e.g. `İ`).
- A term that normalizes to the empty string (for example `-` or a single
  space) matches every item and highlights nothing. The search bar still shows
  its counter and X button because the input itself is not empty.
- Matching runs on the raw Markdown source of the description, not on the
  rendered HTML. This is simple and predictable: what you typed in the editor
  is what the search sees. The one visible difference is a link: searching
  for a word from the URL matches the item, but the rendered preview shows
  only the link text. Section 3.4 covers how the user still sees that the
  item matched.

### 3.2 Highlighting: keep an index map from the normalized text back to the original

Normalizing alone is enough for filtering, but for highlighting we must know
which characters of the _original_ text a hit covers. So `normalize` returns
both the normalized string and an array `map` where `map[i]` is the index in
the original string of the character that produced normalized character `i`.

A hit at normalized positions `[start, end)` becomes the original range
`[map[start], map[end - 1] + 1)`. This range includes the separators between
the matched letters, so searching `some text` in `some-text` highlights the
whole `some-text`, which is what a reader expects.

Hits are found left to right, without overlapping (after a hit, scanning
continues at its end). All hits are highlighted, not only the first.

### 3.3 Two rendering paths for the highlight

**Headline (plain text).** Split the headline into segments
`{ text, hit: boolean }[]` and render them with `v-for`; a hit segment is a
`<mark>`. No HTML string is built, so there is no new XSS surface.

**Description (rendered Markdown).** The description is already HTML from
`renderMarkdown`, shown with `v-html`. Highlighting is done afterwards, on the
DOM, by a helper that:

1. removes any `<mark class="search-hit">` it added on an earlier run (unwrap
   the mark, then `root.normalize()` to merge text nodes back together) — this
   makes the helper safe to call again on every keystroke;
2. collects all text nodes under the root with a `TreeWalker`, joins their
   text into one string, and remembers for every character which node and
   offset it came from;
3. normalizes that joined string (section 3.1) and finds the hits;
4. wraps each hit in `<mark class="search-hit">`, splitting text nodes where
   needed. A hit can span several nodes (for example `some **text**` renders
   as a text node, then `<strong>`), so one hit may produce several `<mark>`
   elements, one per text node it touches.

Working on the DOM instead of the HTML string has two advantages. It only
ever _adds_ `<mark>` elements around existing text, so the DOMPurify
guarantee is kept. And it can run _after_ `highlightCodeBlocks`, which
replaces the inner HTML of every `<pre><code>` block; a string-based approach
would lose the marks in code blocks in the drawer.

The mark styling is one global rule in `base.css` (marks live inside
`v-html` content, so scoped styles would need `:deep` everywhere anyway):

```css
mark.search-hit {
  background: var(--search-highlight);
  color: inherit;
  border-radius: 2px;
  padding: 0 0.1em;
}
```

with a new `--search-highlight` token in both the light and the dark palette.

**What is not highlighted.** The headline `<input>` in the drawer and the
description `<textarea>` cannot contain marks; browsers do not support
styled ranges inside form fields. The headline is highlighted on the card in
the list next to it, and the description is highlighted in the drawer's
preview (static or live). This is acceptable and is documented as a known
limit.

### 3.4 A hit that the card preview does not show

The card clips the description preview to four lines. A hit further down, or
a hit in a Markdown link target that is not rendered as text, would be
invisible, and the user could not see why the item is in the result list.

Chosen option: **a short hint line on the card**, shown when the description
matches but no `<mark>` is visible inside the clipped preview:

> Also matches in the description (not visible in this preview)

"Visible" is decided after the marks are placed: the first `<mark>` in the
preview is visible when `mark.offsetTop + mark.offsetHeight` is at most the
preview's `clientHeight`. No mark at all (link-target case) also counts as
not visible. Clicking the card opens the drawer, where the whole description
is shown with all hits.

Why not expand the preview instead: a long description with a hit near the
end would turn one card into a full page, and a list of such cards is hard to
scan. The hint keeps the cards compact and still tells the user what
happened. Expanding stays possible later as a click on the hint, if wanted.

Small extra in the drawer: when it opens or the term changes while a search
is active, scroll the first `<mark>` into view (`scrollIntoView({ block:
'center' })`) so the hit is on screen without scrolling by hand.

### 3.5 Filtering and drag-and-drop

`BoardView` computes a `visibleBoard` by filtering each section with the
matcher and passes those lists to the columns. The column header count then
shows the visible count automatically.

`SectionColumn` emits indices into the list it received. While a filter is
active, those indices no longer match the full section, so a drag would move
the wrong item. Therefore drag-and-drop is **disabled while the search is
active** (`disabled` option on `VueDraggable`, which SortableJS supports, and
the handle is hidden). Reordering a filtered list is not a feature that was
asked for, and this keeps the reorder command untouched.

### 3.6 Search state lives in a small store

The term is needed by the search bar, `BoardView` (filtering, counts, and
the shortcut), `ItemCard`, and `ItemDetailDrawer`. Passing it down as props
through `SectionColumn` is possible but noisy. A small Pinia store
`useSearchStore` with `term`, a `normalizedTerm` computed, and `isActive`
(`term !== ''`) fits the existing `store/` layout and keeps the components
simple. The term is not persisted; a reload starts with an empty search.

The pure matching logic does not go into the store. It goes into
`src/search/match.ts` so that it can be unit-tested without Vue or Pinia.

### 3.7 Keyboard handling

Extend `onGlobalKeydown` in `BoardView`:

- `Ctrl+F` / `Ctrl+K` (also `Cmd` on macOS, no `Shift`, no `Alt`):
  - if `document.activeElement` is the search input → return without
    `preventDefault()`, so the browser's own find bar or address bar opens;
  - otherwise → `preventDefault()`, then focus the search input and select
    its text. This works from anywhere, including the drawer's textarea,
    because the drawer's own `keydown` handler does not stop propagation.
- The existing `n` shortcut already ignores key presses inside inputs, so
  typing `n` in the search bar is fine.
- `Escape` **inside the search input** clears the term when it is not empty,
  and otherwise blurs the input. The handler calls `stopPropagation()`, so
  the global `Escape` handler does not close the drawer. This is what keeps
  "starting a search neither opens nor closes the edit mode" true also for
  the way out.

The decision "focus the search or let the browser handle it" is put in a
pure function (`searchShortcutAction(event, searchHasFocus)` returning
`'focus' | 'browser' | 'none'`) so it can be tested without mounting
`BoardView`.

### 3.8 The search bar itself

New component `SearchBar.vue`, `position: fixed; left: 1rem; bottom: 1rem;
z-index: 50`, same surface, border, shadow, and font size as
`SyncStatusOverlay` so the two corners look like a pair. On narrow screens
both boxes must not overlap: cap the bar's width with
`max-width: calc(100vw - 2rem)` and keep it above the overlay when the
viewport is narrower than both boxes side by side (a small media query
that moves the search bar up by the overlay's height, or stacks them).

Contents, left to right:

- a magnifying glass icon (Font Awesome, already used in the app),
- `<input type="text">` with `aria-label="Search items"` and placeholder
  `Search (Ctrl+F)`. `type="text"` rather than `type="search"`, because some
  browsers add their own clear button to `type="search"` and we want exactly
  one X,
- the counter `x out of y items`, shown only while the term is not empty,
  with `aria-live="polite"` so screen readers announce the count,
- the X button (`fa-xmark`, `title="Clear search"`), shown only while the
  term is not empty. It clears the term and returns focus to the input.

The bar is rendered only when the board is shown (not when `learning.md` is
missing), because there is nothing to search then.

## 4. Files to add or change

| File                                                                                                | Change                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/search/match.ts` (new)                                                                         | `normalize(text) → { text, map }`, `findHits(text, term) → [start, end)[]`, `splitIntoSegments(text, term)`, `itemMatches(item, term)`. Pure functions, no DOM. |
| `src/search/markDom.ts` (new)                                                                       | `markHits(root: Element, term: string): { markCount: number }`. Unmarks, walks text nodes, wraps hits (section 3.3).                                            |
| `src/store/search.ts` (new)                                                                         | Pinia store: `term`, `normalizedTerm`, `isActive`, `clear()`.                                                                                                   |
| `src/components/SearchBar.vue` (new)                                                                | The floating bar (section 3.8). Props: `matchCount`, `totalCount`. Exposes `focus()`.                                                                           |
| `src/components/BoardView.vue`                                                                      | `visibleBoard` computed, match/total counts, the shortcut in `onGlobalKeydown`, render `SearchBar`, pass filtered lists to the columns.                         |
| `src/components/SectionColumn.vue`                                                                  | New prop `dragDisabled`; pass it to `VueDraggable` and hide the handle.                                                                                         |
| `src/components/ItemCard.vue`                                                                       | Headline as segments with `<mark>`; after render, call `markHits` on the preview and decide whether to show the hint line (section 3.4).                        |
| `src/components/ItemDetailDrawer.vue`                                                               | Add the search term to the existing `watch`; after `highlightCodeBlocks`, call `markHits` on the preview elements; scroll the first mark into view.             |
| `src/styles/base.css`                                                                               | `--search-highlight` token (light and dark), global `mark.search-hit` rule.                                                                                     |
| `tests/search/match.test.ts`, `tests/search/markDom.test.ts`, `tests/search/shortcut.test.ts` (new) | See section 5.                                                                                                                                                  |
| `README.md`                                                                                         | New "Search" section; remove "Search functionality" from "Future ideas".                                                                                        |

## 5. Tests

The test setup already runs in `jsdom` (see `vite.config.ts`), so DOM tests
need no extra setup. `@vue/test-utils` is installed but unused so far; the
plan keeps the logic in plain functions so that component tests stay
optional.

`tests/search/match.test.ts`:

- The fuzzy examples from the requirement, one `it` each: `Some Text`,
  `sometext`, `some-text`, `some. text`, `some; text`, `some\n    text`.
- Negative cases: `some tex` matches, `text some` does not, `sometextx`
  does not.
- Unicode: `Übung` matches `übung`; a Cyrillic term matches its lower-case
  form; digits are kept (`v2` matches `V 2`).
- The index map: a hit in `some-text` for `some text` gives the original
  range `[0, 9)`; a term that normalizes to empty gives no hits.
- Several hits in one string, and two adjacent hits (`aaaa` with term `aa`
  gives exactly two non-overlapping hits).
- `splitIntoSegments` — the concatenation of all segments equals the input;
  segments alternate correctly; no empty segments.
- `itemMatches` — headline only, description only, both, neither,
  `description === null`.
- Property tests with `fast-check`, in the style of
  [`tests/format/roundtrip.property.test.ts`](../tests/format/roundtrip.property.test.ts):
  - for any string `s` and any substring `t` of `s`, `findHits(s, t)` is not
    empty;
  - for any hit range, `normalize(s.slice(start, end)).text` equals
    `normalize(t).text`;
  - the segments always concatenate back to `s`.

`tests/search/markDom.test.ts` (jsdom):

- A hit inside one text node produces one `<mark>`.
- A hit across an element boundary (`some <strong>text</strong>`) produces
  two marks and `root.textContent` is unchanged.
- A hit inside `<pre><code>` is marked.
- Calling `markHits` twice with different terms leaves only the marks of the
  second term; calling it with an empty term leaves no marks; text content
  is unchanged in all cases.
- The returned `markCount` is correct.

`tests/search/shortcut.test.ts`:

- `Ctrl+F` and `Ctrl+K` with the search unfocused → `'focus'`.
- The same with the search focused → `'browser'`.
- `Ctrl+Shift+F`, plain `f`, `Ctrl+G` → `'none'`.
- `Meta+F` on macOS → `'focus'`.

Manual checks (no automated layout in jsdom):

- The hint line appears for a hit on line 6 of a description and does not
  appear for a hit on line 1.
- Opening the drawer while a search is active shows the marks in the
  preview, including inside a code block, and the first hit is scrolled
  into view.
- Typing in the search bar while the drawer is open keeps the drawer open;
  `Escape` in the search bar does not close it.
- With the search input focused, `Ctrl+F` opens the browser's find bar.
- Drag handles disappear while a search is active and come back when it is
  cleared.
- Light and dark mode: the mark is readable on cards, in the columns' tinted
  backgrounds, and inside code blocks.

## 6. Risks and trade-offs

- **Highlighting is recomputed on every keystroke** for every visible card.
  The work is a linear scan over each item's text plus a small DOM update;
  for the board sizes this app is made for (tens to a few hundred items) it
  is far below one frame. If it ever becomes noticeable, debounce the term
  by about 100 ms in the store; the counter and the filter would lag by
  that much, nothing else changes.
- **Raw-source matching vs. rendered highlighting** (section 3.1) can match
  an item without producing a visible mark. The hint line covers this; the
  drawer does too, because its preview is the same rendered HTML. If this
  turns out to be confusing, the alternative is to match on the rendered
  plain text (cache `renderMarkdown` per description), at the cost of a
  markdown render for every item on the first keystroke.
- **The visibility check for the hint uses layout** (`offsetTop`). It runs
  once after each render and not on window resize, so a resize can in rare
  cases leave a stale hint until the next keystroke. Acceptable; a
  `ResizeObserver` can be added later if needed.
- **Drag-and-drop is off during a search.** This is deliberate (section 3.5).
- **Form fields cannot be highlighted.** Documented as a known limit
  (section 3.3).
- **`Ctrl+K` in some browsers** (Firefox, Chrome) normally focuses the
  address bar. Taking it over on the page is what was asked; the second
  press, with the search bar focused, hands it back to the browser.

## 7. Suggested order

1. `src/search/match.ts` with its tests. Everything else builds on it and it
   can be reviewed on its own.
2. The store, `SearchBar.vue`, filtering in `BoardView`, the shortcut, and
   drag disabling. At this point the feature is usable without highlights.
3. Headline segments in `ItemCard`.
4. `src/search/markDom.ts` with its tests, then wire it into `ItemCard`
   (with the hint line) and `ItemDetailDrawer` (with scroll-into-view).
5. CSS tokens, README, and the manual checks from section 5.

## 8. Documentation to update

[`README.md`](../README.md): add a short "Search" section after "Step 4"
that explains the search bar, the two shortcuts, the fuzzy rules in one
sentence, the counter, the hint line on cards, and that reordering is paused
while a search is active. Remove "Search functionality" from "Future ideas".
