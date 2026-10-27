# Spec Delta

## ADDED Requirements

### Requirement: Keyword links only from Complete items

Only the keywords of items with the status Complete SHALL create keyword links.

**Rationale**: An item explains a term only after the item is complete.

#### Scenario: Item with the status New

- **WHEN** the headline of an item with the status New is `OWASP` and another description contains "OWASP"
- **THEN** the detail view shows no keyword link for "OWASP"

### Requirement: Note in the list of an item that is not Complete

WHILE the open item does not have the status Complete and the headline gives at least one keyword, the "Linked as:" list SHALL show "Other items link here only when this item is complete."

#### Scenario: New item

- **WHEN** the user opens the New item `Source`
- **THEN** "Linked as:" shows `Source` and the note "Other items link here only when this item is complete."

### Requirement: Warning for a keyword of another item

The "Linked as:" list of each item that gives the same keyword as another item with the status Complete SHALL show the warning "Also used by "…" — not linked.", also for an item that does not have the status Complete.

**Rationale**: The user sees the conflict before completing the second item.

#### Scenario: Warning on a New item

- **WHEN** the Complete item `Risk assessment` and the New item `risk-assessment` exist
- **THEN** the "Linked as:" list of `risk-assessment` shows "Also used by "Risk assessment" — not linked."

## REMOVED Requirements

### Requirement: Only Complete items create links

**Reason**: The scenario named the status WIP.

**Migration**: The requirement "Keyword links only from Complete items" replaces this requirement with the same text.

### Requirement: Note for an item that is not Complete

**Reason**: The scenario named the status WIP.

**Migration**: The requirement "Note in the list of an item that is not Complete" replaces this requirement with the same text.

### Requirement: Warning for the same keyword

**Reason**: The scenario named the status WIP.

**Migration**: The requirement "Warning for a keyword of another item" replaces this requirement with the same text.
