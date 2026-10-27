# Design

## Context

See proposal.md for the motivation.

The data model holds the WIP distinction in 2 places:

- `src/domain/types.ts`: each `Item` variant has `statusTemp` (`active`, `complete`, `discarded`).
  `Status` (`new`, `wip`, `complete`, `discarded`) is derived by `statusOf()` from `statusTemp` and the description.
  `Board` has 4 lists: `new`, `wip`, `complete`, `discarded`.
- `src/format/`: `parse` checks that an item with a description is under `## WIP` and an item without a description is under `## New`.
  `serialize` writes 4 sections.

`applySetDescription` moves an item between `new` and `wip`.
`validateBoard` has the error `ActiveItemInWrongArray` for that split.
`merge` sorts the merged items into sections with `statusOf()`.

The store does not persist pending commands, so no stored command names the section `wip` after a reload.

## Goals / Non-Goals

**Goals:**

- One property `status` on each item, with the values `new`, `complete`, and `discarded`, and one type `Status` for these values.
- A `Board` with 3 lists, so that the type system rejects each remaining use of `wip`.
- Format version 6 with a migration from version 5.

**Non-Goals:**

- No change to the sync queue, the debounce, or the conflict dialog beyond the removed section label.
- No change to older migrations (v0 to v5) and their frozen fixtures.

## Decisions

### `status` replaces `statusTemp`, `statusOf()` goes away

The item variants become `NewItem` (`status: 'new'`, `description: Description | null`), `CompleteItem` (`status: 'complete'`), and `DiscardedItem` (`status: 'discarded'`).
`Status` becomes `Item['status']`.
Each caller of `statusOf(item)` reads `item.status` instead.

`ActiveItem` is renamed to `NewItem`, because "active" is not a Glossary term and the variant now matches exactly one status.

Alternative: keep `statusOf()` as a one-line accessor.
Rejected, because the function would only return `item.status` and keeps 2 names for one concept.

### `Board` keeps one list for each status

`Board` becomes `{ tags, new, complete, discarded }`.
`emptyBoard`, `allItems`, `boardsEqual`, `locate`, `removeAt`, and the reorder code lose the `wip` branch.
`prependWip` goes away; `uncomplete` and `restore` use `prependNew`.
`applySetDescription` replaces the item at the same index for the status New, like the other sections.
`validateBoard` loses `ActiveItemInWrongArray`; `MisplacedItem` with `item.status` covers the remaining check.

### Parser and serializer

`parse` reads 3 sections, `## New`, `## Complete`, `## Discarded`.
In the New section an item has an optional fence, like the Discarded section.
The 2 errors "An item with a description must be under WIP, not New" and "An item without a description must be under New, not WIP" go away.
A version 6 file with `## WIP` fails with the existing error 'Expected section heading "## Complete", found "## WIP"'.
`serialize` writes 3 sections.
`commitMessage.ts`, `ConflictDialog.vue`, and `ItemDetailView.vue` lose the label `WIP`.

### Migration `v5-merge-new-and-wip.ts`

The migration is a pure text function, like `migrateV4`:

1. Check that line 1 is `<!-- version:5 -->`, and write `<!-- version:6 -->`.
2. Copy each line up to `## WIP` unchanged.
3. Collect the lines of the WIP section, from the line after `## WIP` up to `## Complete`, and skip the `## WIP` line.
   A fence is copied as one unit, so a `## Complete` line inside a description does not end the section.
4. Write the collected item lines at the end of the New section, after the old New items, then `## Complete` and the rest of the file unchanged.

The blank lines between the items stay as they are; the next save writes the canonical blank lines.
The description of the migration is `merge the WIP section into the New section`, which is also the body line of the upgrade commit.

Alternative: put the WIP items first.
Rejected by the user: the order is New items first, then WIP items, like the migration from version 3 to 4.

### Board UI

`BoardView.vue` renders 3 `SectionColumn` components.
`ItemCard.vue` shows the **Complete** button WHEN `section === 'new'` and the item has a description.
`base.css` and `SectionColumn.vue` lose `--wip` and `--wip-tint`.
`ItemDetailView.vue` keeps the disabled **Complete** button for an item without a description.

### Merge

`merge.ts` sorts the merged items with `item.status` into 3 sections.
A description change on one side no longer moves an item to another section, so `orderSection` sees fewer moved items.
The existing tests for a restored item and a reopened item change from the WIP section to the New section.

## Risks / Trade-offs

- [An app with format version 5 in a second browser tab or on a second device opens a version 6 file] → The existing "Newer file" handling blocks each save and shows **Reload**. The user loses the unsaved commands of that tab.
- [A description contains the line `## WIP` or `## Complete`] → The migration copies each fence as one unit; a migration fixture with such a description tests this.
- [The parser fixtures in `tests/format/fixtures/` are version 5 files] → The procedure "Add a format version" copies the valid fixtures to `tests/format/migrations/fixtures/v5/` first. Then the parser fixtures move to version 6 by a targeted edit of the version line and the WIP section, without a reformat. The fixtures that test the removed errors (`description-under-new.md`, `no-description-under-wip.md`) become fixtures that parse without an error, or go away with their test case.
- [Users lose the visual signal "this item has a description"] → Accepted. The card keeps the **Complete** button only for an item with a description, which marks such items.

## Migration Plan

1. Release the app with format version 6.
2. On the first load, the app upgrades `learning.md` with 1 commit "Upgrade learning.md from format v5 to v6".
3. Rollback: revert the app commit and restore `learning.md` from the commit before the upgrade commit on GitHub. An app with format version 5 cannot read a version 6 file.
