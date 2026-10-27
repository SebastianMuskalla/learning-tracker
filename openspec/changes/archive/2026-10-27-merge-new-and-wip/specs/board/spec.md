# Spec Delta

## ADDED Requirements

### Requirement: Default status

IF an item has neither the status Complete nor the status Discarded, THEN the item SHALL have the status New.

#### Scenario: Adding a description keeps the status New

- **WHEN** the user adds a description to an item with the status New
- **THEN** the item has the status New

#### Scenario: Removing the description keeps the status New

- **WHEN** the user removes the whole description of an item with the status New
- **THEN** the item has the status New

### Requirement: Description change keeps the position

WHEN the user adds or removes the description of an item with the status New, the app SHALL keep the item at the same position in the New section.

**Rationale**: The status of the item does not change, so the card stays where the user put the card.

#### Scenario: Add a description

- **WHEN** the New section contains "Git", "Docker", and "Rust" in this order, and the user adds a description to "Docker"
- **THEN** the New section contains "Git", "Docker", and "Rust" in this order, and "Docker" has the status New

### Requirement: Cards in a section

Each section SHALL show the cards of the items with the status of the section.

#### Scenario: Card in the New section

- **WHEN** the item "Docker" has the status New
- **THEN** the card of "Docker" appears in the New section and in no other section

### Requirement: Record the completion time

WHEN the app completes an item, the app SHALL record the completion time.

#### Scenario: Complete an item with the status New

- **WHEN** the user completes an item with the status New
- **THEN** the item has the status Complete, with the current time as the completion time

### Requirement: Discard keeps the description

WHEN the app discards an item, the item SHALL keep the description.

#### Scenario: Discard an item with the status New

- **WHEN** the user clicks **Discard** for an item with the status New and the description "Notes"
- **THEN** the item has the status Discarded and keeps the description "Notes"

### Requirement: No Complete button on a card without a description

The card of an item without a description SHALL NOT show a **Complete** button.

**Rationale**: The app completes an item only WHEN the item has a description.

#### Scenario: Card without a description

- **WHEN** the item "Docker" has the status New and no description
- **THEN** the card of "Docker" shows no **Complete** button

### Requirement: Description editor of an item that is not Complete

WHEN the detail view opens an item with the status New or Discarded, the detail view SHALL show a text field for the description and a live preview of the rendered description.

#### Scenario: Open a New item

- **WHEN** the user opens an item with the status New
- **THEN** the detail view shows the text field and the live preview of the description

## MODIFIED Requirements

### Requirement: Statuses

Each item SHALL have exactly one status: New, Complete, or Discarded.

#### Scenario: Status after completion

- **WHEN** the user completes an item with the status New
- **THEN** the item has the status Complete and no longer has the status New

### Requirement: Sections

The board SHALL show one section for each status, in the order New, Complete, Discarded.

#### Scenario: Empty section

- **WHEN** no item has the status Discarded
- **THEN** the board shows an empty Discarded section

### Requirement: Complete an item

The app SHALL change the status of an item from New to Complete only WHEN the item has a description.

#### Scenario: Item without description

- **WHEN** an item with the status New and no description is open in the detail view
- **THEN** the **Complete** button is disabled

#### Scenario: Item with description

- **WHEN** an item with the status New and a description is open in the detail view
- **THEN** the **Complete** button is enabled

### Requirement: Reopen an item

WHEN the user clicks **Reopen** for an item with the status Complete, the app SHALL change the status of the item to New.

#### Scenario: Reopen

- **WHEN** the user clicks **Reopen** for an item with the status Complete
- **THEN** the item has the status New and is first in the New section

### Requirement: Discard an item

The app SHALL change the status of an item from New or Complete to Discarded.

#### Scenario: Discard an item with the status Complete

- **WHEN** the user clicks **Discard** for an item with the status Complete
- **THEN** the item has the status Discarded

### Requirement: Restore an item

WHEN the user restores an item with the status Discarded, the app SHALL change the status of the item to New.

#### Scenario: Restore without description

- **WHEN** the user restores a discarded item without a description
- **THEN** the item has the status New

#### Scenario: Restore with description

- **WHEN** the user restores a discarded item with the description "Notes"
- **THEN** the item has the status New, keeps the description "Notes", and is first in the New section

### Requirement: Discard instead of delete

IF the item has a status other than Discarded, THEN the confirmation dialog for a delete SHALL also offer **Discard instead**.

#### Scenario: Discard instead

- **WHEN** the user clicks **Delete** for an item with the status New and then **Discard instead**
- **THEN** the item has the status Discarded

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

### Requirement: Complete on the card

The card of an item with the status New and a description SHALL show a **Complete** button that completes the item.

**Rationale**: The user completes an item without opening the detail view.

#### Scenario: Complete on the card

- **WHEN** the user clicks the **Complete** button on the card of the New item "Docker" with a description
- **THEN** "Docker" has the status Complete and is first in the Complete section

## REMOVED Requirements

### Requirement: Status New

**Reason**: An item with the status New now has a description or has no description; the old scenario described a status change that no longer happens.

**Migration**: The requirement "Default status" replaces this requirement.

### Requirement: Status WIP

**Reason**: The status WIP merges into the status New.

**Migration**: The migration from format version 5 to 6 moves each item of the WIP section to the New section.

### Requirement: Section content

**Reason**: The scenario named the WIP section.

**Migration**: The requirement "Cards in a section" replaces this requirement with the same text.

### Requirement: Completion time

**Reason**: The scenario named the status WIP.

**Migration**: The requirement "Record the completion time" replaces this requirement with the same text.

### Requirement: Description of a discarded item

**Reason**: The scenario named the status WIP.

**Migration**: The requirement "Discard keeps the description" replaces this requirement with the same text.

### Requirement: Description editor

**Reason**: The requirement and the scenario named the status WIP.

**Migration**: The requirement "Description editor of an item that is not Complete" replaces this requirement.
