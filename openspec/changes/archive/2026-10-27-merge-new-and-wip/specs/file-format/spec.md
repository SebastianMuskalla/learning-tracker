# Spec Delta

## ADDED Requirements

### Requirement: Three sections

The file SHALL contain the three sections New, Complete, and Discarded in this order, also WHEN a section is empty.

#### Scenario: Missing empty section

- **WHEN** the file has no `## Discarded` line
- **THEN** the app reports a parse error

#### Scenario: WIP section in a version 6 file

- **WHEN** a version 6 file contains the line `## WIP` between `## New` and `## Complete`
- **THEN** the app reports a parse error

### Requirement: WIP items in the migration from version 5

The migration from format version 5 to 6 SHALL move each item from the WIP section to the New section and SHALL remove the line `## WIP`.

#### Scenario: Item with a description

- **WHEN** a version 5 file has the item "Docker" with the description "Notes" in the WIP section
- **THEN** the migration writes "Docker" with the description "Notes" in the New section, and the file has no `## WIP` line

### Requirement: Order in the migration from version 5

WHEN the migration from format version 5 to 6 fills the New section, the migration SHALL first add the items from the old New section and then the items from the old WIP section, each in the old order.

#### Scenario: Two sections

- **WHEN** the old New section contains "A" and "B", and the old WIP section contains "C" and "D"
- **THEN** the New section contains "A", "B", "C", "D" in this order

### Requirement: Item in a section that does not match

The parser SHALL report an error for an item in a section that does not match the status of the item.

#### Scenario: No description in the Complete section

- **WHEN** an item in the Complete section has a completion time and no fence
- **THEN** the app reports a parse error

### Requirement: Metadata form of the section

The parser SHALL report an error for an item with a metadata form that does not match the section.

#### Scenario: Completion time in the New section

- **WHEN** an item in the New section has a metadata line with `completed:2026-09-16T14:32:07Z`
- **THEN** the app reports a parse error

### Requirement: No fence for an item without a description

An item without a description SHALL have no fence.

#### Scenario: Save an item without a description

- **WHEN** the app saves an item with the status New and no description
- **THEN** the file contains no fence for that item

## MODIFIED Requirements

### Requirement: Strict syntax

The parser SHALL report an error for each input outside the grammar, instead of guessing the meaning of the input.

**Rationale**: The project prefers simple code over a parser that accepts more than one variant; the git history keeps the last good version after a bad hand edit.

#### Scenario: Hand edit with an error

- **WHEN** a hand edit puts an item without a description into the Complete section
- **THEN** the app reports a parse error with a line number and saves nothing

### Requirement: Grammar

The app SHALL read and save `learning.md` according to this grammar (format version 6):

```
file        := header tagdef* blank* section('New') section('Complete') section('Discarded')
header      := '<!-- version:6 -->' NL blank* '# Learning' NL blank*
tagdef      := '<!-- tag:' NAME ' color:#' HEX6LOWER ' -->' NL blank*
section(S)  := '## ' S NL blank* item(S)*
item(S)     := '### ' headline NL
               meta(S) NL
               tagline*
               fence(S)
               blank*
fence(New)       := fence?
fence(Complete)  := fence
fence(Discarded) := fence?
meta(New)       := '<!-- id:' ULID ' created:' TIMESTAMP ' -->'
meta(Complete)  := '<!-- id:' ULID ' created:' TIMESTAMP ' completed:' TIMESTAMP ' -->'
meta(Discarded) := '<!-- id:' ULID ' created:' TIMESTAMP ' discarded:' TIMESTAMP ' -->'
tagline     := '- ' NAME NL
TIMESTAMP   := YYYY '-' MM '-' DD 'T' hh ':' mm ':' ss 'Z'   (UTC)
fence       := '`'{N} 'markdown' NL rawline+ '`'{N} NL         (N is 3 or more; at least one rawline is not blank)
rawline     := a line that does not close the fence
blank       := an empty line (outside fences)
```

#### Scenario: Example item

- **WHEN** the file contains this item in the New section:

  ````text
  ### Application Security Posture Management (ASPM)
  <!-- id:01M3VXEYY3V9M2BMAMMK12GMBS created:2026-10-01T14:21:29Z -->
  - DevOps
  - Security
  ```markdown
  Optional description
  ```
  ````

- **THEN** the app reads one item with the tags `DevOps` and `Security` and the description "Optional description"

### Requirement: Format version line

The first line of `learning.md` SHALL be `<!-- version:N -->`, where N is the format version.

#### Scenario: Missing version line

- **WHEN** a file with items has no version line
- **THEN** the app shows "learning.md has no version line. It is not a file that this app wrote."

#### Scenario: Byte order mark before the version line

- **WHEN** the file starts with a UTF-8 byte order mark and then `<!-- version:6 -->`
- **THEN** the app shows "learning.md has no version line. It is not a file that this app wrote."

### Requirement: Current format version

The app SHALL know exactly one current format version.

#### Scenario: Save with the current format version

- **WHEN** the app with the current format version 6 saves `learning.md`
- **THEN** the first line of the file is `<!-- version:6 -->`

### Requirement: Upgrade older files

IF the file has an older format version, THEN the app SHALL apply the migrations one after the other to the text.

#### Scenario: Two migration steps

- **WHEN** the app with format version 6 opens a version 4 file
- **THEN** the app applies the migration from version 4 to 5, and then the migration from version 5 to 6

### Requirement: Format version of an empty file

The app SHALL treat a `learning.md` that is empty or contains only whitespace as format version 0.

**Rationale**: The app then writes the empty board with the same upgrade commit as for each other old file.

#### Scenario: Empty file

- **WHEN** the app with format version 6 opens an empty `learning.md`
- **THEN** the app saves 1 commit "Upgrade learning.md from format v0 to v6", and the board shows 3 empty sections

### Requirement: Upgrade commit

The app SHALL save the result of an upgrade as one commit with the subject "Upgrade learning.md from format vA to vB" and one body line `vX → vY: <step>` for each migration step, also WHEN the upgrade skips versions.

#### Scenario: Upgrade from version 3

- **WHEN** the app with format version 6 opens a version 3 file
- **THEN** the app saves 1 commit "Upgrade learning.md from format v3 to v6"

#### Scenario: Body lines

- **WHEN** the app with format version 6 opens a version 4 file
- **THEN** the commit body has 2 lines: `v4 → v5: remove the tag "Uncategorized", which is now a reserved name` and `v5 → v6: merge the WIP section into the New section`

### Requirement: Newer file

IF the file has a newer format version than the app, THEN the app SHALL block each save.

**Rationale**: An older app would destroy data that only the newer format can hold.

#### Scenario: Old app, new file

- **WHEN** the app with format version 6 opens a version 7 file
- **THEN** the app shows "All writes are blocked until the app is reloaded." and saves nothing

#### Scenario: Version 5 app, version 6 file

- **WHEN** the app with format version 5 opens a version 6 file
- **THEN** the app shows "All writes are blocked until the app is reloaded." and saves nothing

### Requirement: Reload after a newer file

IF the file has a newer format version than the app, THEN the app SHALL show a **Reload** button.

#### Scenario: Reload button

- **WHEN** the app with format version 6 opens a version 7 file
- **THEN** the app shows **Reload**

### Requirement: Read again after a rejected save

IF GitHub rejects a save because the file changed, THEN the app SHALL read the file again.

#### Scenario: Rejected upgrade

- **WHEN** GitHub rejects the upgrade save of device B, because device A upgraded the file first
- **THEN** device B reads the file again and finds a version 6 file

## REMOVED Requirements

### Requirement: Four sections

**Reason**: Format version 6 has no WIP section.

**Migration**: The requirement "Three sections" replaces this requirement. The migration from format version 5 to 6 removes the `## WIP` line.

### Requirement: Item in the wrong section

**Reason**: The scenario described an item with a description in the New section, which format version 6 allows.

**Migration**: The requirement "Item in a section that does not match" replaces this requirement with the same text.

### Requirement: Metadata form

**Reason**: The scenario named the WIP section.

**Migration**: The requirement "Metadata form of the section" replaces this requirement with the same text.

### Requirement: No fence without a description

**Reason**: The scenario assumed that each item with the status New has no description.

**Migration**: The requirement "No fence for an item without a description" replaces this requirement with the same text.
