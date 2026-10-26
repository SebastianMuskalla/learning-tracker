# search Specification

## Purpose

Lets the user find items by text in the headline or the description, and limits the board to the
matching items.

## Requirements

### Requirement: Search bar

The board SHALL show a floating search bar in the bottom-left corner.

#### Scenario: Search bar position

- **WHEN** the board is shown
- **THEN** the search bar is in the bottom-left corner

### Requirement: Search shortcut

WHEN the user presses Ctrl+F or Ctrl+K, or, on macOS, Cmd+F or Cmd+K, the app SHALL move the focus to the search bar, also WHILE the user edits a description.

#### Scenario: Shortcut while editing

- **WHEN** the user edits a description and presses Ctrl+K
- **THEN** the search bar gets the focus

### Requirement: Browser shortcut from the search bar

WHEN the search bar already has the focus, the keys Ctrl+F, Ctrl+K, Cmd+F, and Cmd+K SHALL trigger the browser's own shortcut.

**Rationale**: The user can still reach the browser's own find function.

#### Scenario: Shortcut a second time

- **WHEN** the search bar has the focus and the user presses Ctrl+F
- **THEN** the browser opens its own find bar

### Requirement: Match rule

An item SHALL match the search term WHEN the term occurs in the headline or the description of the item.

#### Scenario: Match in the headline

- **WHEN** the search term is `docker` and the headline is `Docker Compose`
- **THEN** the item matches

### Requirement: Ignored characters

The comparison of the search term and the text SHALL ignore case and each character that is not a letter or a digit.

#### Scenario: Ignored characters

- **WHEN** the search term is `some text`
- **THEN** a description that contains `Some Text`, `sometext`, or `some-text` matches

#### Scenario: Symbols in the search term

- **WHEN** the search term is `C#`
- **THEN** the headline `Cobol` matches, because the app compares only the letter `c`

### Requirement: Search term without a letter or a digit

IF the search term contains no letter and no digit, THEN each item SHALL match the search term.

**Rationale**: The comparison ignores each character that is not a letter or a digit, so such a term is empty for the comparison.

#### Scenario: Hyphen as the search term

- **WHEN** the board has 20 items and the search term is `-`
- **THEN** the board shows each item, and the search bar shows "20 out of 20 items"

### Requirement: Filtered board

WHILE the search bar is not empty, the board SHALL show only the matching items.

#### Scenario: Clear the search

- **WHEN** the user clicks the X button in the search bar
- **THEN** the search bar is empty and the board shows each item

### Requirement: Section count during a search

WHILE the search bar is not empty, each section count SHALL read "x of y", where x is the number of shown items and y is the number of items in the section.

#### Scenario: Section count

- **WHEN** the search matches 2 of the 5 items in the WIP section
- **THEN** the section count of the WIP section reads "2 of 5"

### Requirement: Match count

WHILE the search bar is not empty, the search bar SHALL show the number of matching items out of the total number of items.

#### Scenario: Match count

- **WHEN** the search matches 3 of 20 items
- **THEN** the search bar shows "3 out of 20 items"

### Requirement: Clear button

WHILE the search bar is not empty, the search bar SHALL show an X button that clears the search.

#### Scenario: Clear button appears

- **WHEN** the user types `docker` into the empty search bar
- **THEN** the search bar shows the X button

### Requirement: Highlight matches

The app SHALL highlight the matching text on the cards and in the detail view of the open item.

#### Scenario: Highlight in the detail view

- **WHEN** a search is active and the user opens a matching item
- **THEN** the detail view highlights the matching text

### Requirement: Hidden match note

IF a description matches only outside the clipped card preview, or only in a link target, THEN the card SHALL show the note "Also matches in the description (not visible in this preview)".

#### Scenario: Match in a link target

- **WHEN** the search term is `example.org` and occurs only in the link target `https://example.org` in a description
- **THEN** the card shows the note "Also matches in the description (not visible in this preview)"

### Requirement: No reorder during search

WHILE a search is active, the app SHALL NOT allow reordering by drag and drop.

**Rationale**: The positions on the screen do not match the positions in the unfiltered list.

#### Scenario: Drag during search

- **WHEN** a search is active and the user tries to drag a card
- **THEN** the order of the items does not change
