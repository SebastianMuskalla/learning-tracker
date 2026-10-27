# sync Specification

## Purpose

Saves the user's changes to `learning.md` on GitHub as commits, keeps the board up to date with the file
on GitHub, and resolves concurrent changes without data loss.

## Requirements

### Requirement: Immediate local change

The board SHALL show each change at once, before the save completes.

#### Scenario: Change during a save

- **WHEN** a save is in progress and the user adds an item
- **THEN** the board shows the new item at once

### Requirement: Board content

WHILE the conflict dialog is closed, the board SHALL show the last confirmed file content on GitHub plus each unsaved change, applied in order.

**Rationale**: A change that the user makes while a save is in progress goes into the next save.

#### Scenario: Next save after a change during a save

- **WHEN** a save is in progress and the user adds an item
- **THEN** the next commit contains the new item

### Requirement: Board content during the conflict dialog

WHILE the conflict dialog is open, the board SHALL show the last confirmed file content on GitHub plus each change that the user made after GitHub rejected the save, without the changes of the rejected batch.

**Rationale**: The conflict dialog shows the changes of the rejected batch; the board shows the changes again after the user chooses a version.

#### Scenario: Conflict on a description

- **WHEN** the user changed the description of item A to "Mine", another device changed the description of item A to "Theirs", and the conflict dialog is open
- **THEN** the board shows the description of item A from the last confirmed file content, and neither "Mine" nor "Theirs"

### Requirement: Batched commits

The app SHALL save each batch as one commit.

**Rationale**: One commit per click would flood the history of the data repository.

#### Scenario: Three changes in one commit

- **WHEN** the user makes 3 changes within 500 ms and then stops
- **THEN** the app creates 1 commit with the 3 changes

### Requirement: Save timing

The app SHALL start a save 800 ms after the last change, at the latest 5 s after the first unsaved change, or at once WHEN 10 changes are unsaved.

#### Scenario: Three edits within 500 ms

- **WHEN** the user makes 3 changes within 500 ms and then stops
- **THEN** the app starts 1 save 800 ms after the third change

#### Scenario: Ten changes

- **WHEN** the user makes 10 changes without a pause
- **THEN** the app starts the save after the tenth change

### Requirement: Commit message of a single change

The commit message of a batch with one change SHALL describe that change, for example `Add "Docker"` or `Complete "Docker"`.

#### Scenario: Batch of 1

- **WHEN** the app saves a batch that completes "Docker"
- **THEN** the commit message is `Complete "Docker"`

### Requirement: Commit message of more than one change

The commit message of a batch with more than one change SHALL have the subject `Update learning.md (N changes)` and one body line per change.

#### Scenario: Batch of 2

- **WHEN** the app saves a batch that adds "A" and completes "B"
- **THEN** the commit subject is `Update learning.md (2 changes)` and the body lists `Add "A"` and `Complete "B"`

### Requirement: Commit message without lost changes

The commit message of a batch SHALL name only the changes that the commit contains.

**Rationale**: A change that the app discarded after a conflict choice, or dropped after a merge, is not in the file, so the history would be wrong.

#### Scenario: Keep GitHub's version

- **WHEN** a batch renames "A" to "A mine" and "B" to "B mine", the rename of "A" conflicts with GitHub, and the user clicks **Keep GitHub's version**
- **THEN** the commit message is `Rename "B" → "B mine"`

#### Scenario: Item deleted on GitHub

- **WHEN** a batch adds "Docker" and renames "Git" to "Git basics", another device deleted "Git", and GitHub rejects the save
- **THEN** the commit message is `Add "Docker"`

### Requirement: No empty commit

The app SHALL NOT create a commit that leaves `learning.md` unchanged.

#### Scenario: Reorder back to the old position

- **WHEN** the New section contains only "Docker" and the user drops "Docker" at its own position
- **THEN** the app creates no commit

#### Scenario: Merge result equals the GitHub version

- **WHEN** the user renamed item A, another device deleted item A, and GitHub rejects the save
- **THEN** the app creates no commit, because the merged file equals the file on GitHub

### Requirement: Sync status box position

The board SHALL show the sync status box in the bottom-right corner.

#### Scenario: Sync status box position

- **WHEN** the board is shown
- **THEN** the sync status box is in the bottom-right corner

### Requirement: Sync status while pending

The sync status box SHALL show "Unsaved changes…" WHILE a save is pending.

#### Scenario: Pending save

- **WHEN** the user made a change 300 ms ago
- **THEN** the sync status box shows "Unsaved changes…"

### Requirement: Sync status while saving

The sync status box SHALL show "Saving…" WHILE a save is in progress.

#### Scenario: Save in progress

- **WHEN** the app has sent a save to GitHub and has no response yet
- **THEN** the sync status box shows "Saving…"

### Requirement: Save on hide

WHEN the page becomes hidden, the app SHALL save the unsaved changes at once.

#### Scenario: Switch to another tab

- **WHEN** 1 change is unsaved and the user switches to another browser tab
- **THEN** the app starts the save at once

### Requirement: Save on close

WHEN the page closes, IF the conflict dialog is closed and the request body is at most 60 KiB, THEN the app SHALL send the unsaved changes one last time without waiting for the response.

**Rationale**: Browsers reject a request during page close with a body larger than 64 KiB; 60 KiB leaves a margin. While the conflict dialog is open, the app holds the changes until the user chooses a version.

#### Scenario: Close the tab

- **WHEN** 1 change is unsaved and the user closes the tab
- **THEN** the app sends 1 save with the change and does not wait for the response

#### Scenario: Close the tab during the conflict dialog

- **WHEN** the conflict dialog is open and the user closes the tab
- **THEN** the app sends no save

### Requirement: Warn before leaving

WHILE a change is unsaved, WHILE the conflict dialog is open, or WHILE a field in the detail view contains unsaved text, the app SHALL ask the browser to confirm before the page closes or reloads.

#### Scenario: Reload with unsaved text

- **WHEN** the user has typed into the description and presses F5
- **THEN** the browser asks the user to confirm

### Requirement: Keep changes on temporary errors

IF a save fails because of a network error, a GitHub server error, or a rate limit, THEN the app SHALL keep the changes on the board.

#### Scenario: Offline

- **WHEN** a save that adds "Docker" fails because the network is down
- **THEN** the board still shows the item "Docker"

### Requirement: Retry message

IF a save fails because of a network error or a GitHub server error, THEN the sync status box SHALL show "Not saved — will retry".

#### Scenario: Retry message

- **WHEN** a save fails because the network is down
- **THEN** the sync status box shows "Not saved — will retry"

### Requirement: Retry schedule

IF a save fails because of a network error or a GitHub server error, THEN the app SHALL retry the save after 2 s, 5 s, 15 s, and then every 60 s.

#### Scenario: First retry

- **WHEN** a save fails because the network is down
- **THEN** the app retries the save after 2 s

### Requirement: Short rate limit

IF GitHub rejects a save with a rate limit that ends within 30 s, THEN the app SHALL wait until the rate limit ends and SHALL send the save again, with at most 4 tries for each save.

**Rationale**: A short wait inside the save keeps the batch together and avoids a retry message for a pause of a few seconds.

#### Scenario: Rate limit of 10 s

- **WHEN** GitHub rejects the first try of a save with a rate limit that ends in 10 s
- **THEN** the app sends the second try of the save after 10 s

### Requirement: Rate limit without an end time

IF GitHub rejects a save with a rate limit and states no end time, THEN the app SHALL wait 250 ms, 750 ms, and 1500 ms, each plus up to 20 %, before the second, the third, and the fourth try.

#### Scenario: No end time

- **WHEN** GitHub rejects the first try of a save with a rate limit and sends neither `Retry-After` nor `x-ratelimit-reset`
- **THEN** the app sends the second try after 250 ms to 300 ms

### Requirement: Sync status during a short rate limit

WHILE the app waits for the end of a short rate limit, the sync status box SHALL show "Saving…".

#### Scenario: Waiting for 10 s

- **WHEN** the app waits for a rate limit that ends in 10 s
- **THEN** the sync status box shows "Saving…"

### Requirement: Long rate limit

IF GitHub rejects a save with a rate limit that ends later than 30 s from now, or GitHub rejects the fourth try of a save with a rate limit, THEN the app SHALL retry the save at the end of the rate limit, and no earlier than 2 s after the rejection.

#### Scenario: Rate limit of 5 minutes

- **WHEN** GitHub rejects a save at 14:00 with a rate limit that ends at 14:05
- **THEN** the app retries the save at 14:05

### Requirement: Retry when back online

WHEN the browser is back online, the app SHALL retry a failed save at once.

#### Scenario: Back online

- **WHEN** a save failed because the network was down, and the network is back 1 s later
- **THEN** the app retries the save at once, before the scheduled retry after 2 s

### Requirement: Time of the next try

IF the app retries a save at the end of a long rate limit, THEN the sync status box SHALL show "Not saved — will retry at" and the time of the next try, in the time format of the browser.

#### Scenario: Long rate limit

- **WHEN** GitHub rejects a save at 14:00 with a rate limit that ends at 14:05
- **THEN** the sync status box shows "Not saved — will retry at 14:05."

### Requirement: Permanent errors

IF a save fails because of an error that a retry cannot fix, for example a missing branch, THEN the app SHALL undo the changes of that save.

#### Scenario: Missing branch

- **WHEN** a save fails because the configured branch `drafts` does not exist
- **THEN** the board no longer shows the changes of that save

### Requirement: Rejected save

IF GitHub rejects a save because the file changed since the last read, THEN the app SHALL read the current file and SHALL compare the current file with the last confirmed version and with the local version.

#### Scenario: Read after a rejection

- **WHEN** GitHub rejects a save because another device saved the file first
- **THEN** the app reads the current file before the app tries the save again

### Requirement: Retry without a real conflict

IF GitHub rejected a save and the conflict dialog has no item and no tag to show, THEN the app SHALL retry the save without asking the user.

**Rationale**: A rejection can occur without a real conflict, for example a stale read right after a save, or changes to different items.

#### Scenario: Changes to different items

- **WHEN** the user changed item A, another device changed item B, and GitHub rejects the save
- **THEN** the app combines both changes and saves both changes without asking

#### Scenario: Same change twice

- **WHEN** the user and another device made the same change to item A
- **THEN** the app saves without asking

### Requirement: Tries for a rejected save

IF GitHub rejects a save because the file changed, THEN the app SHALL wait 250 ms, 750 ms, and 1500 ms, each plus up to 20 %, before the second, the third, and the fourth try.

#### Scenario: Second try

- **WHEN** GitHub rejects the first try of a save because the file changed, and the app merged the change from GitHub without a conflict
- **THEN** the app waits 250 ms to 300 ms after the merge and then sends the second try

### Requirement: Fourth rejected try

IF GitHub rejects the fourth try of a save because the file changed, THEN the sync status box SHALL show "Could not save after several attempts. Not saved — will retry.", and the app SHALL keep the changes and retry the save with the schedule of the requirement "Retry schedule".

#### Scenario: Four rejections

- **WHEN** GitHub rejects 4 tries of a save because each read returns a new version
- **THEN** the board still shows the changes, the sync status box shows "Could not save after several attempts. Not saved — will retry.", and the app tries the save again after 2 s

### Requirement: A delete wins

IF GitHub rejected a save, and one side deleted an item or a tag that the other side changed, THEN the app SHALL delete the item or the tag without the conflict dialog.

**Rationale**: The user deleted the item or tag on purpose on one device; the risk is that a change from the other device is lost, and the message for dropped changes names only a change of this device.

#### Scenario: Local delete, rename on GitHub

- **WHEN** the user deleted the item "Docker", another device renamed "Docker" to "Podman", and GitHub rejects the save
- **THEN** the app saves the delete without asking, the board shows neither "Docker" nor "Podman", and the app shows no message

#### Scenario: Local tag delete, item change on GitHub

- **WHEN** the user deleted the tag `Cloud`, another device renamed the item "Docker" that has the tag `Cloud`, and GitHub rejects the save
- **THEN** the app saves without asking, no tag `Cloud` exists, and the item has the new headline and no tag `Cloud`

### Requirement: Local reorder after a rejected save

IF GitHub rejected a save, and only the user reordered a section, THEN the app SHALL keep the order of the user in that section.

#### Scenario: Reorder and a change to another item

- **WHEN** the user moved item B above item A in the New section, another device changed the headline of item C, and GitHub rejects the save
- **THEN** the app saves item B above item A, and the commit message is `Reorder New`

### Requirement: Reorder on both sides

IF GitHub rejected a save, and the user and another device reordered the same section in different ways, THEN the app SHALL keep the order from GitHub in that section and SHALL drop the reorder of the user.

**Rationale**: The conflict dialog shows items and tags, not the order of a section.

#### Scenario: Two reorders of the New section

- **WHEN** the user moved item C to the end of the New section, another device moved item A to the top of the New section, and GitHub rejects the save
- **THEN** the board shows the order from GitHub, and the app shows "One change no longer fit the newest version of learning.md and was dropped."

### Requirement: Position of a moved item after a rejected save

IF GitHub rejected a save, THEN the app SHALL keep the position of the user for each item that the user added or moved to another section.

#### Scenario: Restore and a change to another item

- **WHEN** the user restored the discarded item "Docker" with a description, another device changed the headline of a New item, and GitHub rejects the save
- **THEN** "Docker" is first in the New section

### Requirement: Position of an item from GitHub in a reordered section

IF GitHub rejected a save, the user reordered a section, and another device added an item to that section, THEN the app SHALL place the new item at the position from GitHub.

#### Scenario: Item added on GitHub

- **WHEN** the user moved B above A in the New section, another device added N at the top of the New section, and GitHub rejects the save
- **THEN** the New section shows N, B, A in this order

### Requirement: Conflict check before unsaved changes are applied again

WHEN the last confirmed file content takes in a change from GitHub, the app SHALL compare each unsaved change with the change from GitHub before the app applies the unsaved change again.

**Rationale**: An unsaved change that the app applies again without the comparison replaces the change from GitHub, and the conflict dialog never opens.

#### Scenario: Change during a rejected save

- **WHEN** the user changes the description of item A while a save of a change to item B is in progress, another device changes the description of item A, and GitHub rejects the save
- **THEN** the conflict dialog shows item A

#### Scenario: Change to another item during a rejected save

- **WHEN** the user changes the description of item A while a save of a change to item B is in progress, another device changes the headline of item C, and GitHub rejects the save
- **THEN** the app saves the changes to item A, item B, and item C without asking

#### Scenario: Change while the conflict dialog is open

- **WHEN** the user changed the description of item C while the conflict dialog for item A was open, another device changed the description of item C, and the user clicks **Keep my version**
- **THEN** the conflict dialog opens again and shows item C

### Requirement: Conflict dialog

IF an item or a tag changed in different ways locally and on GitHub, and neither side deleted the item or the tag, THEN the conflict dialog SHALL show the local version and the GitHub version of each such item and each such tag side by side.

#### Scenario: Conflict on one item

- **WHEN** the user changed the description of item A to "Mine", and another device changed the description of item A to "Theirs"
- **THEN** the conflict dialog shows item A with "Mine" under "Your version" and "Theirs" under "GitHub's version", side by side

#### Scenario: Conflict on two items

- **WHEN** item A and item B each changed in different ways locally and on GitHub
- **THEN** the conflict dialog shows both versions of item A and both versions of item B

#### Scenario: Same tag name in different case

- **WHEN** the user created the tag `vue`, and another device created the tag `Vue` before the save
- **THEN** the conflict dialog shows the tag `vue` under "Your version" and the tag `Vue` under "GitHub's version"

### Requirement: Content of an item version

The conflict dialog SHALL show the headline, the status, the tags, and the description of each version of an item.

#### Scenario: Description conflict

- **WHEN** only the description of item A changed in different ways locally and on GitHub
- **THEN** the conflict dialog shows both descriptions of item A, and the user sees how the two versions differ

### Requirement: Content of a tag version

The conflict dialog SHALL show the name and the color of each version of a tag.

#### Scenario: Color conflict

- **WHEN** the user changed the color of the tag `Cloud` to `#aacbee`, and another device changed the color of `Cloud` to `#f6c9a4`
- **THEN** the conflict dialog shows `#aacbee` under "Your version" and `#f6c9a4` under "GitHub's version"

### Requirement: Conflict choices

The conflict dialog SHALL offer the choices **Keep my version** and **Keep GitHub's version**.

#### Scenario: Two buttons

- **WHEN** the conflict dialog is open
- **THEN** the conflict dialog shows the buttons **Keep my version** and **Keep GitHub's version**

### Requirement: Conflict dialog stays open

The conflict dialog SHALL stay open until the user chooses a version.

#### Scenario: Escape

- **WHEN** the conflict dialog is open and the user presses Esc
- **THEN** the conflict dialog stays open

### Requirement: Discard the other version

WHEN the user chooses a version in the conflict dialog, the app SHALL discard the other version of each item and each tag that the conflict dialog shows.

#### Scenario: Keep my version

- **WHEN** the conflict dialog is open and the user clicks **Keep my version**
- **THEN** the app saves the local version and the board no longer shows the GitHub version of the item

### Requirement: Keep changes without a conflict

WHEN the user chooses a version in the conflict dialog, the app SHALL keep each change that the conflict dialog does not show, from the app and from GitHub.

**Rationale**: The choice is about the items that changed in both places; a change to another item is no reason to lose it.

#### Scenario: Other items after Keep my version

- **WHEN** the user changed the descriptions of item A and item B, another device changed the description of item A and the headline of item C, and the user clicks **Keep my version**
- **THEN** the board shows the local description of item A, the local description of item B, and the GitHub headline of item C

#### Scenario: Other items after Keep GitHub's version

- **WHEN** the user changed the descriptions of item A and item B, another device changed the description of item A and the headline of item C, and the user clicks **Keep GitHub's version**
- **THEN** the board shows the GitHub description of item A, the local description of item B, and the GitHub headline of item C

### Requirement: Read again after a choice

WHEN the user chooses a version in the conflict dialog, the app SHALL read the file again.

**Rationale**: The file on GitHub can change again while the conflict dialog is open.

#### Scenario: Keep GitHub's version

- **WHEN** the conflict dialog is open and the user clicks **Keep GitHub's version**
- **THEN** the app reads the file again and the board shows the newest GitHub version of the item

### Requirement: Changes during the conflict dialog

The app SHALL hold each change that the user makes WHILE the conflict dialog is open, and SHALL save the held changes after the user chooses a version.

#### Scenario: Change while the dialog is open

- **WHEN** the user adds "Docker" while the conflict dialog is open, and then clicks **Keep my version**
- **THEN** the app saves the change `Add "Docker"` after the conflict is resolved

### Requirement: Reload from GitHub

WHEN the user reloads the page, WHEN the tab becomes visible again, or WHEN the browser shows the page again from the back/forward cache, the app SHALL read `learning.md` from GitHub again.

#### Scenario: Return to the tab

- **WHEN** no change is unsaved and the user returns to the tab
- **THEN** the app reads `learning.md` again and shows the newest version

#### Scenario: Back button

- **WHEN** no change is unsaved, the user opens another page in the same tab, and then clicks the back button of the browser
- **THEN** the app reads `learning.md` again

### Requirement: No reload with unsaved work

The app SHALL NOT read the file again WHILE changes are unsaved or WHILE the conflict dialog is open.

#### Scenario: Return with unsaved changes

- **WHEN** a change is unsaved and the user returns to the tab
- **THEN** the app does not read the file again

#### Scenario: Failed save before a read

- **WHEN** a save fails with HTTP 403, and the user closes the settings page without a new token
- **THEN** the app tries the save again and does not read the file again

### Requirement: Dropped changes

IF an unsaved change no longer fits the newest file, for example a rename of an item that was deleted on GitHub, THEN the app SHALL drop the change.

#### Scenario: Rename of a deleted item

- **WHEN** the user renamed item A and another device deleted item A
- **THEN** the app drops the rename

### Requirement: Dropped change message

WHEN the app drops an unsaved change, the app SHALL tell the user, unless the change adds a tag that another device deleted.

#### Scenario: Message for one dropped change

- **WHEN** the app drops 1 change
- **THEN** the app shows "One change no longer fit the newest version of learning.md and was dropped."

### Requirement: Tag added before a tag delete on GitHub

IF the user adds a tag to an item, and another device deletes the tag before the app saves the change, THEN the app SHALL remove the tag from the item without a message.

**Rationale**: A tag delete removes the tag from each item, also on the other device; the commit message does not name the dropped change.

#### Scenario: Tag deleted on another device

- **WHEN** the user adds the tag `Cloud` to the item "Docker", another device deletes the tag `Cloud`, and GitHub rejects the save
- **THEN** "Docker" has no tag `Cloud`, the app shows no message, and no commit message names `Tag "Docker" with "Cloud"`

### Requirement: More than one tab

WHEN a tab saves `learning.md`, the app SHALL notify the other tabs of the same browser.

#### Scenario: Notify the other tab

- **WHEN** the app is open in 2 tabs and tab 1 saves a change
- **THEN** tab 1 tells tab 2 the new version of `learning.md`

### Requirement: Read after a notification

WHEN a tab gets a notification of a new version, the tab SHALL read the new version.

#### Scenario: Two tabs

- **WHEN** the app is open in 2 tabs and tab 1 saves a change
- **THEN** tab 2 reads the new version and shows the change
