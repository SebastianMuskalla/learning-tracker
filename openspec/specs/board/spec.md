# board Specification

## Purpose

Shows the user's items on a board with one section per status, and lets the user add, edit, change the
status of, reorder, and delete items.

## Requirements

### Requirement: Statuses

Each item SHALL have exactly one status: New, Complete, or Discarded.

#### Scenario: Status after completion

- **WHEN** the user completes an item with the status New
- **THEN** the item has the status Complete and no longer has the status New

### Requirement: Default status

IF an item has neither the status Complete nor the status Discarded, THEN the item SHALL have the status New.

#### Scenario: Adding a description keeps the status New

- **WHEN** the user adds a description to an item with the status New
- **THEN** the item has the status New

#### Scenario: Removing the description keeps the status New

- **WHEN** the user removes the whole description of an item with the status New
- **THEN** the item has the status New

### Requirement: Sections

The board SHALL show one section for each status, in the order New, Complete, Discarded.

#### Scenario: Empty section

- **WHEN** no item has the status Discarded
- **THEN** the board shows an empty Discarded section

### Requirement: Cards in a section

Each section SHALL show the cards of the items with the status of the section.

#### Scenario: Card in the New section

- **WHEN** the item "Docker" has the status New
- **THEN** the card of "Docker" appears in the New section and in no other section

### Requirement: Add an item

The app SHALL add an item from the headline that the user enters in the "Item" field of the header bar.

#### Scenario: Add an item

- **WHEN** the user enters "Docker" and submits
- **THEN** the board shows an item "Docker" with the status New

### Requirement: Position after a change

WHEN the app adds an item or changes the status of an item, the app SHALL place the item at the top of the section of the new status.

#### Scenario: New item on top

- **WHEN** the New section contains "Git" and the user adds "Docker"
- **THEN** "Docker" is first and "Git" is second in the New section

#### Scenario: Completed item on top

- **WHEN** the Complete section contains "Git" and the user completes "Docker"
- **THEN** "Docker" is first in the Complete section

### Requirement: Description change keeps the position

WHEN the user adds or removes the description of an item with the status New, the app SHALL keep the item at the same position in the New section.

**Rationale**: The status of the item does not change, so the card stays where the user put the card.

#### Scenario: Add a description

- **WHEN** the New section contains "Git", "Docker", and "Rust" in this order, and the user adds a description to "Docker"
- **THEN** the New section contains "Git", "Docker", and "Rust" in this order, and "Docker" has the status New

### Requirement: Headline validation

The app SHALL reject a headline that is empty, that has more than one line, or that contains `<!--`.

**Rationale**: `learning.md` stores each headline on one line, and `<!--` would start a comment in the file.

#### Scenario: Empty headline

- **WHEN** the user submits an empty "Item" field
- **THEN** the app shows "Enter a short, single-line headline." and adds no item

### Requirement: Complete an item

The app SHALL change the status of an item from New to Complete only WHEN the item has a description.

#### Scenario: Item without description

- **WHEN** an item with the status New and no description is open in the detail view
- **THEN** the **Complete** button is disabled

#### Scenario: Item with description

- **WHEN** an item with the status New and a description is open in the detail view
- **THEN** the **Complete** button is enabled

### Requirement: Record the completion time

WHEN the app completes an item, the app SHALL record the completion time.

#### Scenario: Complete an item with the status New

- **WHEN** the user completes an item with the status New
- **THEN** the item has the status Complete, with the current time as the completion time

### Requirement: Reopen an item

WHEN the user clicks **Reopen** for an item with the status Complete, the app SHALL change the status of the item to New.

#### Scenario: Reopen

- **WHEN** the user clicks **Reopen** for an item with the status Complete
- **THEN** the item has the status New and is first in the New section

### Requirement: Completion time on reopen

WHEN the user reopens an item, the app SHALL remove the completion time of the item.

#### Scenario: Reopen removes the completion time

- **WHEN** the user reopens the item "Docker" with the completion time `2026-09-16T14:32:07Z`
- **THEN** the item "Docker" has no completion time

### Requirement: Discard an item

The app SHALL change the status of an item from New or Complete to Discarded.

#### Scenario: Discard an item with the status Complete

- **WHEN** the user clicks **Discard** for an item with the status Complete
- **THEN** the item has the status Discarded

### Requirement: Discard time

WHEN the app discards an item, the app SHALL record the discard time.

#### Scenario: Discard records the time

- **WHEN** the user discards an item at `2026-09-16T14:32:07Z`
- **THEN** the item has the discard time `2026-09-16T14:32:07Z`

### Requirement: Completion time on discard

WHEN the app discards an item with the status Complete, the app SHALL remove the completion time of the item.

#### Scenario: Discard a Complete item

- **WHEN** the user discards the item "Docker" with the completion time `2026-09-16T14:32:07Z`
- **THEN** the item "Docker" has the status Discarded, a discard time, and no completion time

### Requirement: Discard keeps the description

WHEN the app discards an item, the item SHALL keep the description.

#### Scenario: Discard an item with the status New

- **WHEN** the user clicks **Discard** for an item with the status New and the description "Notes"
- **THEN** the item has the status Discarded and keeps the description "Notes"

### Requirement: Restore an item

WHEN the user restores an item with the status Discarded, the app SHALL change the status of the item to New.

#### Scenario: Restore without description

- **WHEN** the user restores a discarded item without a description
- **THEN** the item has the status New

#### Scenario: Restore with description

- **WHEN** the user restores a discarded item with the description "Notes"
- **THEN** the item has the status New, keeps the description "Notes", and is first in the New section

### Requirement: Discard time on restore

WHEN the user restores an item, the app SHALL remove the discard time of the item.

#### Scenario: Restore removes the discard time

- **WHEN** the user restores the item "Docker" with the discard time `2026-09-16T14:32:07Z`
- **THEN** the item "Docker" has no discard time

### Requirement: Delete an item

The app SHALL delete an item permanently only after the user confirms.

**Rationale**: Deleting removes the description permanently from the current file; discarding keeps the item.

#### Scenario: Confirm delete

- **WHEN** the user clicks **Delete** and then **Delete permanently**
- **THEN** the board no longer shows the item

### Requirement: Discard instead of delete

IF the item has a status other than Discarded, THEN the confirmation dialog for a delete SHALL also offer **Discard instead**.

#### Scenario: Discard instead

- **WHEN** the user clicks **Delete** for an item with the status New and then **Discard instead**
- **THEN** the item has the status Discarded

### Requirement: Unsaved text of a deleted item

WHEN the user deletes an item in the detail view, the detail view SHALL NOT save the unsaved text of that item.

#### Scenario: Delete with unsaved text

- **WHEN** the user types into the description of the item "Docker", clicks **Delete**, and then **Delete permanently**
- **THEN** the app saves the delete and no change to the description of "Docker"

### Requirement: Reorder items

The app SHALL let the user reorder the items inside one section by drag and drop.

#### Scenario: Drag an item

- **WHEN** the user drags the third card in the New section to the first position
- **THEN** that item is first in the New section

### Requirement: Collapse a section

WHEN the user clicks the title of a section, the app SHALL collapse or expand that section.

#### Scenario: Collapse and expand

- **WHEN** the user clicks the title of the expanded New section twice
- **THEN** the New section is expanded again

### Requirement: Collapsed section content

A collapsed section SHALL show only the title and the section count.

#### Scenario: Collapse while a filter is active

- **WHEN** a search matches 2 of the 5 items in the New section and the user collapses the New section
- **THEN** the collapsed New section shows the section count "2 of 5"

### Requirement: Collapse not stored

The app SHALL NOT store which sections are collapsed.

#### Scenario: Collapse and reload

- **WHEN** the user collapses the Discarded section and reloads the page
- **THEN** each section is expanded

### Requirement: Open the detail view

The app SHALL open the detail view of an item WHEN the user clicks the card, or WHEN the card has keyboard focus and the user presses Enter or Space.

#### Scenario: Keyboard

- **WHEN** the user moves to a card with Tab and presses Enter
- **THEN** the detail view of that item opens

### Requirement: Rename on the card

WHEN the user double-clicks the headline on a card, the card SHALL show the headline in a text field.

#### Scenario: Double-click a headline

- **WHEN** the user double-clicks the headline "Docker" on the card
- **THEN** the card shows a text field with "Docker"

### Requirement: Save a rename on the card

WHEN the user presses Enter or Esc in the text field of the card, or leaves the text field, the app SHALL save the new headline.

#### Scenario: Rename with Enter

- **WHEN** the user changes the headline on the card from "Docker" to "Docker Compose" and presses Enter
- **THEN** the board shows the headline "Docker Compose"

#### Scenario: Rename with Esc

- **WHEN** the user changes the headline on the card from "Docker" to "Podman" and presses Esc
- **THEN** the board shows the headline "Podman"

### Requirement: Complete on the card

The card of an item with the status New and a description SHALL show a **Complete** button that completes the item.

**Rationale**: The user completes an item without opening the detail view.

#### Scenario: Complete on the card

- **WHEN** the user clicks the **Complete** button on the card of the New item "Docker" with a description
- **THEN** "Docker" has the status Complete and is first in the Complete section

### Requirement: No Complete button on a card without a description

The card of an item without a description SHALL NOT show a **Complete** button.

**Rationale**: The app completes an item only WHEN the item has a description.

#### Scenario: Card without a description

- **WHEN** the item "Docker" has the status New and no description
- **THEN** the card of "Docker" shows no **Complete** button

### Requirement: Save edits in the detail view

The detail view SHALL save the headline and the description WHEN the user leaves the field, presses Ctrl+S or, on macOS, Cmd+S, clicks **Send**, closes the detail view, or opens another item.

#### Scenario: Leave the field

- **WHEN** the user changes the headline from "Docker" to "Docker Compose" and leaves the field
- **THEN** the board shows the headline "Docker Compose"

### Requirement: Unchanged field

The detail view SHALL NOT create a change for a field that the user did not change.

#### Scenario: Unchanged field

- **WHEN** the user opens a description, changes nothing, and closes the detail view
- **THEN** the app creates no commit

### Requirement: Remote change of an untouched field

WHILE the user edits a field in the detail view, IF a merge with GitHub changes the same field and the user has typed nothing, THEN the detail view SHALL show the new value.

#### Scenario: User has typed nothing

- **WHEN** the user has opened the description without typing and a merge changes the description to "New text"
- **THEN** the detail view shows "New text"

### Requirement: Remote change of an edited field

WHILE the user edits a field in the detail view, IF a merge with GitHub changes the same field and the user has typed text, THEN the detail view SHALL keep the typed text and SHALL show "This description changed on GitHub" with the buttons **Use theirs** and **Keep mine**.

#### Scenario: User has typed text

- **WHEN** the user has typed into the description and a merge changes the same description
- **THEN** the detail view keeps the typed text and shows **Use theirs** and **Keep mine**

### Requirement: Description editor of an item that is not Complete

WHEN the detail view opens an item with the status New or Discarded, the detail view SHALL show a text field for the description and a live preview of the rendered description.

#### Scenario: Open a New item

- **WHEN** the user opens an item with the status New
- **THEN** the detail view shows the text field and the live preview of the description

### Requirement: Read-only description of a Complete item

WHEN the detail view opens an item with the status Complete, the detail view SHALL show the rendered description read-only.

**Rationale**: The user reads a Complete item more often than the user edits the item.

#### Scenario: Open a Complete item

- **WHEN** the user opens an item with the status Complete
- **THEN** the detail view shows the rendered description and no text field

### Requirement: Edit the description of a Complete item

WHEN the user clicks the read-only description outside a keyword link, the detail view SHALL show the text field and the live preview.

#### Scenario: Click the read-only description

- **WHEN** the user clicks the read-only description of a Complete item
- **THEN** the detail view shows the text field and the live preview of the description

### Requirement: Description of a Complete item

IF the user removes the whole description of an item with the status Complete, THEN the app SHALL keep the description and SHALL show "A completed item must have a description."

**Rationale**: `learning.md` stores each Complete item with a fence, and a fence needs a description.

#### Scenario: Empty description of a Complete item

- **WHEN** the user removes the whole description of the Complete item "Docker" and leaves the field
- **THEN** the item "Docker" keeps the description, and the sync status box shows "A completed item must have a description."

### Requirement: Times in the detail view

The detail view SHALL show the creation time of the item, and the completion time or the discard time WHEN the item has one.

#### Scenario: Complete item

- **WHEN** the user opens an item with the status Complete
- **THEN** the detail view shows "Created" with the creation time and "Completed" with the completion time

### Requirement: Time format in the detail view

The detail view SHALL show each time in the time zone of the browser, in the form `YYYY-MM-DD HH:MM`.

#### Scenario: Browser in Berlin

- **WHEN** the browser uses the time zone Europe/Berlin and the item has the creation time `2026-09-16T14:32:07Z`
- **THEN** the detail view shows "2026-09-16 16:32"

### Requirement: Theme modes

The settings page SHALL offer the theme modes "Device", "Light", and "Dark".

#### Scenario: Select a theme mode

- **WHEN** the user selects "Light" on the settings page
- **THEN** the app uses the light design

### Requirement: Default theme mode

The app SHALL use the theme mode "Device" WHEN the browser stores no theme mode.

#### Scenario: First start

- **WHEN** the user opens the app for the first time in a browser
- **THEN** the theme mode is "Device"

### Requirement: Device theme mode

WHILE the theme mode is "Device", the app SHALL use the design that matches the color-scheme preference of the device.

#### Scenario: Device prefers dark

- **WHEN** the mode is "Device" and the device prefers a dark color scheme
- **THEN** the app uses the dark design

### Requirement: Device without preference

WHILE the theme mode is "Device", IF the device states no color-scheme preference, THEN the app SHALL use the light design.

#### Scenario: Device without preference

- **WHEN** the mode is "Device" and the device states no color-scheme preference
- **THEN** the app uses the light design

### Requirement: Dark design background

The dark design SHALL use a pure black background.

**Rationale**: A pure black background saves power on OLED screens.

#### Scenario: Dark background

- **WHEN** the mode is "Dark"
- **THEN** the board has the background color `#000000`

### Requirement: Theme mode storage

The browser SHALL store the theme mode.

#### Scenario: Reload keeps the mode

- **WHEN** the user selects "Dark" and reloads the page
- **THEN** the app uses the dark design

### Requirement: Theme mode not in the file

`learning.md` SHALL NOT store the theme mode.

#### Scenario: Theme change without a commit

- **WHEN** the user selects "Dark"
- **THEN** the app creates no commit
