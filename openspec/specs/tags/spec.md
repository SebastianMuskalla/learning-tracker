# tags Specification

## Purpose

Lets the user group items with colored tags and limit the board to the items with selected tags, or to
the items without a tag.

## Requirements

### Requirement: Tag definition

A tag SHALL have a name and a color.

#### Scenario: Tag in the file

- **WHEN** the file contains `<!-- tag:Cloud color:#aacbee -->`
- **THEN** the app reads the tag `Cloud` with the color `#aacbee`

### Requirement: Color palette

The color picker on the settings page SHALL offer a palette of 16 pastel colors.

#### Scenario: Color palette

- **WHEN** the user creates a tag on the settings page
- **THEN** the color picker offers 16 colors

### Requirement: Color outside the palette

IF a hand edit gives a tag a color outside the palette, THEN the app SHALL keep the color.

**Rationale**: The file format accepts each color of the form in the requirement "Tag color" of the `file-format` spec.

#### Scenario: Hand-edited color

- **WHEN** a hand edit writes `<!-- tag:Cloud color:#123456 -->`
- **THEN** the tag chips of `Cloud` show the color `#123456`, and the next save keeps `color:#123456`

### Requirement: Tag name characters

A tag name SHALL contain 1 to 32 characters, and each character SHALL be a Unicode letter, a Unicode digit, `_`, or `-`.

#### Scenario: Unicode name

- **WHEN** the user creates the tag `Übung`
- **THEN** the app accepts the name

#### Scenario: Space in a name

- **WHEN** the user creates the tag `Dev Ops`
- **THEN** the app rejects the name

### Requirement: Unique tag names

The app SHALL reject a tag name that equals an existing tag name, ignoring case.

#### Scenario: Duplicate name

- **WHEN** the tag `DevOps` exists and the user creates the tag `devops`
- **THEN** the app rejects the name

### Requirement: Reserved name Uncategorized

The app SHALL reject the tag name `Uncategorized`, ignoring case.

**Rationale**: `Uncategorized` is the name of the filter chip for items without a tag.

#### Scenario: Reserved name

- **WHEN** the user creates the tag `uncategorized`
- **THEN** the app rejects the name

### Requirement: Create a tag

The **Tags** section of the settings page SHALL let the user create a tag.

#### Scenario: Create a tag

- **WHEN** the user enters `Cloud` in the **Tags** section and clicks **Add**
- **THEN** the tag `Cloud` exists

### Requirement: New tag without items

WHEN the user creates a tag, the app SHALL NOT change an item.

#### Scenario: Items after creating a tag

- **WHEN** the user creates the tag `Cloud`
- **THEN** no item has the tag `Cloud`

### Requirement: Order of a new tag

WHEN the user creates a tag, the app SHALL add the tag after the existing tags.

#### Scenario: Third tag

- **WHEN** the tags `Cloud` and `Security` exist in this order and the user creates the tag `DevOps`
- **THEN** the board shows the filter chips `Cloud`, `Security`, `DevOps` in this order

### Requirement: Recolor a tag

The **Tags** section of the settings page SHALL let the user change the color of a tag.

#### Scenario: Recolor a tag

- **WHEN** the user changes the color of the tag `Security`
- **THEN** each tag chip, each filter chip, and each tag dot of `Security` shows the new color

### Requirement: Delete a tag

The **Tags** section of the settings page SHALL let the user delete a tag only after the user confirms.

#### Scenario: Cancel a delete

- **WHEN** the user deletes the tag `Cloud` and then clicks **Cancel**
- **THEN** the tag `Cloud` still exists

### Requirement: Delete confirmation

The confirmation of a tag delete SHALL show the number of affected items.

#### Scenario: Delete a used tag

- **WHEN** 3 items have the tag `Cloud` and the user deletes `Cloud`
- **THEN** the confirmation names 3 affected items

### Requirement: Tag removal from items

WHEN the user deletes a tag, the app SHALL remove the tag from each item that has the tag.

#### Scenario: Confirmed delete

- **WHEN** 3 items have the tag `Cloud` and the user confirms the delete of `Cloud`
- **THEN** no item has the tag `Cloud`

### Requirement: Tag chips

The detail view SHALL show each tag as a tag chip above the description: in full color WHEN the item has the tag, and grayed out WHEN the item does not have the tag.

#### Scenario: Tag chips of an item

- **WHEN** the tags `Cloud` and `Security` exist and the open item has the tag `Cloud`
- **THEN** the tag chip `Cloud` shows full color and the tag chip `Security` is grayed out

### Requirement: Tag an item

WHEN the user clicks a tag chip, the app SHALL add the tag to the item or remove the tag from the item.

#### Scenario: Add a tag

- **WHEN** the user clicks the grayed-out tag chip `Security` in the detail view
- **THEN** the item has the tag `Security` and the tag chip shows full color

### Requirement: Tag dots

Each card SHALL show one tag dot in the tag color for each tag of the item, in the order of the tag definitions.

#### Scenario: Card with two tags

- **WHEN** the tags `Cloud` and `Security` are defined in this order and the item "Docker" has both tags
- **THEN** the card of "Docker" shows a tag dot in the color of `Cloud`, then a tag dot in the color of `Security`

### Requirement: Tag dot name

WHEN the pointer is on a tag dot, the app SHALL show the tag name.

#### Scenario: Hover a tag dot

- **WHEN** the pointer is on the tag dot of `Cloud`
- **THEN** the app shows "Cloud"

### Requirement: Number of tags

An item SHALL have zero or more tags.

#### Scenario: Remove the last tag

- **WHEN** the user removes the only tag `Cloud` from an item
- **THEN** the item has no tag and stays on the board

### Requirement: Filter chips

The board SHALL show a filter chip for each tag below the header bar.

#### Scenario: Two tags

- **WHEN** the tags `Cloud` and `Security` exist
- **THEN** the board shows the filter chips `Cloud` and `Security` below the header bar

### Requirement: Switch a filter chip

WHEN the user clicks a filter chip, the board SHALL switch the filter chip between active and inactive.

#### Scenario: Activate a filter chip

- **WHEN** the filter chip `Cloud` is inactive and the user clicks the filter chip `Cloud`
- **THEN** the filter chip `Cloud` is active

### Requirement: More than one active filter chip

The board SHALL allow more than one active filter chip.

#### Scenario: Second active filter chip

- **WHEN** the filter chip `Cloud` is active and the user clicks the filter chip `Security`
- **THEN** the filter chips `Cloud` and `Security` are both active

### Requirement: Filter chip state for screen readers

Each filter chip SHALL tell a screen reader whether the filter chip is active.

**Rationale**: A user who cannot see the check mark on an active filter chip needs the state from the screen reader.

#### Scenario: Inactive filter chip

- **WHEN** the filter chip **Uncategorized** is inactive
- **THEN** a screen reader announces the filter chip **Uncategorized** as not pressed

#### Scenario: Active filter chip

- **WHEN** the user clicks the inactive filter chip `Cloud`
- **THEN** a screen reader announces the filter chip `Cloud` as pressed

### Requirement: Tag filter

WHILE at least one filter chip is active, the board SHALL show only the items that have the tag of at least one active filter chip.

#### Scenario: Two active tags

- **WHEN** the chips `Cloud` and `Security` are active
- **THEN** the board shows each item that has `Cloud`, `Security`, or both

### Requirement: Section count during a tag filter

WHILE at least one filter chip is active, each section count SHALL read "x of y".

#### Scenario: Section count

- **WHEN** the chip `Cloud` is active and 1 of the 4 items in the New section has the tag `Cloud`
- **THEN** the section count of the New section reads "1 of 4"

### Requirement: Uncategorized filter chip

The board SHALL show the filter chip **Uncategorized** with a dark gray background as the last filter chip WHEN at least one tag exists and at least one item has no tag.

#### Scenario: Untagged item

- **WHEN** the tag `Cloud` exists and the item "Docker" has no tag
- **THEN** the board shows the filter chip **Uncategorized** after the filter chip `Cloud`

### Requirement: Items without a tag in the tag filter

WHILE **Uncategorized** is active, the board SHALL also show each item without a tag, in addition to the items that have the tag of an active filter chip.

#### Scenario: Uncategorized and a tag

- **WHEN** **Uncategorized** and `Cloud` are active
- **THEN** the board shows each item with `Cloud` and each item without a tag

### Requirement: Uncategorized chip disappears

WHEN no item without a tag remains, or WHEN no tag remains, the app SHALL hide the filter chip **Uncategorized** and SHALL set the filter chip to inactive.

#### Scenario: Last untagged item gets a tag

- **WHEN** **Uncategorized** is active and the user tags the last item without a tag
- **THEN** the **Uncategorized** chip disappears
- **AND** when an item without a tag exists again, the **Uncategorized** chip appears as inactive

### Requirement: Uncategorized chip after a failed load

The app SHALL hide the filter chip **Uncategorized** only after the app loaded `learning.md` without an error.

**Rationale**: The app keeps the tag filter of the user when a load fails.

#### Scenario: Failed load

- **WHEN** **Uncategorized** is active and the app fails to load `learning.md` because the network is down
- **THEN** the **Uncategorized** chip stays active

### Requirement: No reorder during tag filter

WHILE at least one filter chip is active, the app SHALL NOT allow reordering by drag and drop.

**Rationale**: The positions on the screen do not match the positions in the unfiltered list.

#### Scenario: Drag during tag filter

- **WHEN** the chip `Cloud` is active and the user tries to drag a card
- **THEN** the order of the items does not change

### Requirement: Remembered tag filter

The browser SHALL store which filter chips are active, including **Uncategorized**.

#### Scenario: Reload keeps the tag filter

- **WHEN** the chip `Cloud` is active and the user reloads the page
- **THEN** the chip `Cloud` is still active

### Requirement: Tag filter not in the file

`learning.md` SHALL NOT store the tag filter.

**Rationale**: The tag filter is a view preference of one browser; the app does not share the tag filter with other devices or other users of the data repository.

#### Scenario: Filter change without a commit

- **WHEN** the user activates the filter chip `Cloud`
- **THEN** the app creates no commit
