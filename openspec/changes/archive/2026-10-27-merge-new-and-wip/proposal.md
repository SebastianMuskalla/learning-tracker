# Proposal

## Why

The statuses New and WIP differ only in whether an item has a description.
The app moves an item between the two sections each time the user adds or removes the whole description, which moves the card to a different place on the board.
The code carries the distinction twice: the property `statusTemp` has 3 values (`active`, `complete`, `discarded`), and `statusOf()` derives a `Status` with 4 values (`new`, `wip`, `complete`, `discarded`).
This change implements the Future Work item "Merge WIP and New and fix `statusTemp`".

## What Changes

- The app knows 3 statuses: New, Complete, and Discarded.
  An item with the status New has a description or has no description.
- Adding or removing the description of an item with the status New keeps the status and the position of the item.
- The app allows the completion of an item only WHEN the item has a description, as before.
- Reopen and restore change the status of the item to New, at the top of the New section.
- The board shows 3 sections: New, Complete, Discarded.
- The card of an item with the status New shows the **Complete** button only WHEN the item has a description.
- **BREAKING**: `learning.md` gets format version 6.
  The file has no `## WIP` section, and an item in the New section has an optional fence.
  The migration from version 5 to 6 moves each item of the WIP section to the end of the New section, after the old New items, each in the old order, and removes the `## WIP` line.
  An app with format version 5 blocks each save after a version 6 file appears.
- In the code, the property `statusTemp` and the type `Status` merge into one property `status` with the values `new`, `complete`, and `discarded`.
  The `wip` list of the `Board` goes away.
- The Glossary loses the term WIP, and the Future Work item goes away.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `board`: 3 statuses instead of 4, no status change on a description change, reopen and restore go to New, 3 sections, the **Complete** button on the card depends on the description.
- `file-format`: format version 6 grammar without the WIP section, 3 sections, the migration from version 5 to 6, updated version numbers in scenarios.
- `keywords`: scenarios use the status New instead of WIP.
- `search`: the scenario for the section count uses the New section.
- `sync`: the scenario for the position of a moved item uses the New section.

## Impact

- `src/domain/`: `types.ts` (`Item`, `Status`, `Board`, `statusOf`), `commands.ts`, `merge.ts`, `board.ts` (validation, `emptyBoard`, equality).
- `src/format/`: `parse.ts`, `serialize.ts`, `commitMessage.ts`, `version.ts` (version 6), a new migration `v5-merge-new-and-wip.ts` and its registration.
- `src/components/`: `BoardView.vue`, `SectionColumn.vue`, `ItemCard.vue`, `ItemDetailView.vue`, `ConflictDialog.vue`; `src/styles/base.css` loses the WIP colors.
- Tests in `tests/domain/`, `tests/format/` (parser fixtures move to version 6, frozen version 5 migration fixtures), `tests/components/`, and `e2e/`.
- `README.md`: introduction, feature overview, Glossary, Future Work.
