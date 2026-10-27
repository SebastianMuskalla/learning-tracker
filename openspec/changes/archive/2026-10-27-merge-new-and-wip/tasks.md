# Tasks

The type change in group 2 breaks the compile of each later layer until group 4 is done.
Groups 1 to 4 therefore verify with targeted `pnpm vitest run <path>` runs; `pnpm check` runs in group 5.

## 1. Migration from version 5 to 6

- [x] 1.1 Copy each valid fixture from `tests/format/fixtures/` (for example `valid.md`, `tags.md`, `timestamps.md`, `evil-descriptions.md`, `empty.md`) byte for byte to `tests/format/migrations/fixtures/v5/`, and verify with `cmp` that the copies equal the originals
- [x] 1.2 Add `src/format/migrations/v5-merge-new-and-wip.ts` (`from: 5`, description `merge the WIP section into the New section`) per design.md, without imports of the parser, the serializer, or `version.ts`, and register the migration in `src/format/migrations/index.ts`; verify that `pnpm lint` reports no import violation for the file
- [x] 1.3 Add a `<name>.expected.md` for each v5 fixture, plus the fixtures `wip-heading-in-description.md` (a description with the lines `## WIP` and `## Complete`) and `order.md` (New "A", "B", WIP "C", "D"), each with an expected output
- [x] 1.4 Add `tests/format/migrations/v5-merge-new-and-wip.test.ts` with the frozen-fixture cases and unit cases for the scenarios "Item with a description" and "Two sections" of the requirements "WIP items in the migration from version 5" and "Order in the migration from version 5"; verify with `pnpm vitest run tests/format/migrations/v5-merge-new-and-wip.test.ts`

## 2. Domain model

- [x] 2.1 In `src/domain/types.ts`, rename `ActiveItem` to `NewItem`, replace `statusTemp` with `status` (`new`, `complete`, `discarded`), set `Status` to `Item['status']`, remove `wip` from `Board`, and remove `statusOf()`
- [x] 2.2 In `src/domain/commands.ts`, remove the `wip` branches and `prependWip`, keep the index of an item with the status New in `applySetDescription`, let `uncomplete` and `restore` prepend to New, and change `WrongStatus.expected` to `Status`
- [x] 2.3 In `src/domain/board.ts`, remove `ActiveItemInWrongArray` and the `wip` list from `emptyBoard`, `validateBoard`, `whichSectionArray`, `boardsEqual`, and `itemsEqual`
- [x] 2.4 In `src/domain/merge.ts`, sort the merged items by `item.status` into 3 sections and replace `isActive` with `isNew`
- [x] 2.5 Update `tests/domain/` (`commands.test.ts`, `board.test.ts`, `merge.test.ts`): a description change keeps status and position (scenario "Add a description"), reopen and restore go to the top of New (scenarios "Reopen", "Restore with description"), `complete` without a description fails with `CompleteRequiresDescription`; verify with `pnpm vitest run tests/domain`

## 3. File format version 6

- [x] 3.1 Set `CURRENT_VERSION` to 6 in `src/format/version.ts`
- [x] 3.2 In `src/format/parse.ts`, read the 3 sections New, Complete, Discarded, accept an optional fence in the New section, and remove the 2 New/WIP placement errors
- [x] 3.3 In `src/format/serialize.ts` and `src/format/commitMessage.ts`, remove the WIP section and the label `WIP`
- [x] 3.4 Move the parser fixtures in `tests/format/fixtures/` to version 6 by a targeted edit of the version line and the WIP section, without a reformat; turn `description-under-new.md` into a fixture that parses without an error, remove `no-description-under-wip.md` and its test case, and rename `completed-under-wip.md` to `completed-under-new.md`
- [x] 3.5 Update `tests/format/` (`parse.test.ts`, `roundtrip.property.test.ts`, `commitMessage.test.ts`, `migrations/chain.test.ts` and `registry.test.ts` where they name version 5) for the scenarios "WIP section in a version 6 file", "No description in the Complete section", "Completion time in the New section", "Body lines", and "Empty file"; verify with `pnpm vitest run tests/format`

## 4. Board UI

- [x] 4.1 In `src/components/BoardView.vue`, render the 3 sections New, Complete, Discarded, and remove the `wip` filter entry
- [x] 4.2 In `src/components/ItemCard.vue`, show the **Complete** button only for a New item with a description
- [x] 4.3 In `ItemDetailView.vue` and `ConflictDialog.vue`, read `item.status` instead of `statusTemp` and `statusOf()`, and remove the label `WIP` and the `.status-badge.wip` style
- [x] 4.4 Remove `--wip` and `--wip-tint` from `src/styles/base.css` and `.column.wip` from `SectionColumn.vue`
- [x] 4.5 Update `tests/components/` (`BoardView.test.ts`, `ItemCard.test.ts`, `ItemDetailView.test.ts`) and `tests/keywords/boardBuilder.ts` for the scenarios "Card without a description", "Complete on the card", and "Item with description"; verify with `pnpm vitest run tests/components`

## 5. Integration and documentation

- [x] 5.1 Update `e2e/app.spec.ts` (the `wip` list, the `## WIP` fixture text, and the upgrade commit message, which now ends with `v5 → v6: merge the WIP section into the New section`); verify with `pnpm test:e2e`
- [x] 5.2 Update `README.md`: the introduction names 3 statuses, the feature overview drops "moves to WIP", the Glossary drops the term WIP and updates the term status, and Future Work drops "Merge WIP and New and fix `statusTemp`"; verify that `grep -n WIP README.md` returns no match
- [x] 5.3 Check that `grep -rn "statusTemp\|statusOf\|ActiveItem\|'wip'" src tests e2e` returns no match outside the frozen migration fixtures and the v0 to v4 migrations
- [x] 5.4 Run `pnpm check` and verify that each step passes

## Workflow follow-up

- Archive the change after review, so that the delta specs replace the requirements in `openspec/specs/`.
