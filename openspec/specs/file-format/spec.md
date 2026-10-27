# file-format Specification

## Purpose

Defines the format of `learning.md`, how the app upgrades older formats, and how the app protects the
file against invalid content.

## Requirements

### Requirement: Readable file

The app SHALL save `learning.md` as Markdown that a human can read as raw text and in the rendered view on github.com.

#### Scenario: Rendered view on GitHub

- **WHEN** the user opens `learning.md` on github.com
- **THEN** GitHub shows each section and each headline as a heading, and each description in a code box

### Requirement: Strict syntax

The parser SHALL report an error for each input outside the grammar, instead of guessing the meaning of the input.

**Rationale**: The project prefers simple code over a parser that accepts more than one variant; the git history keeps the last good version after a bad hand edit.

#### Scenario: Hand edit with an error

- **WHEN** a hand edit puts an item without a description into the Complete section
- **THEN** the app reports a parse error with a line number and saves nothing

### Requirement: One way to save a value

The app SHALL save each value in exactly one way.

#### Scenario: Save a tag

- **WHEN** the app saves the tag `Cloud` with the color `#aacbee`
- **THEN** the file contains the line `<!-- tag:Cloud color:#aacbee -->`

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

### Requirement: Three sections

The file SHALL contain the three sections New, Complete, and Discarded in this order, also WHEN a section is empty.

#### Scenario: Missing empty section

- **WHEN** the file has no `## Discarded` line
- **THEN** the app reports a parse error

#### Scenario: WIP section in a version 6 file

- **WHEN** a version 6 file contains the line `## WIP` between `## New` and `## Complete`
- **THEN** the app reports a parse error

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

### Requirement: Timestamps

Each timestamp SHALL use the full UTC form, for example `2026-09-16T14:32:07Z`.

#### Scenario: Completion time

- **WHEN** the user completes an item at 14:32:07 UTC on 16 September 2026
- **THEN** the metadata line of the item contains `completed:2026-09-16T14:32:07Z`

### Requirement: Plain date

The parser SHALL report an error for a plain date.

#### Scenario: Plain date

- **WHEN** a metadata line contains `created:2026-09-16`
- **THEN** the app reports a parse error

### Requirement: Dates that exist

The parser SHALL report an error for a timestamp with a date or a time of day that does not exist.

#### Scenario: 30 February

- **WHEN** a metadata line contains `created:2026-02-30T00:00:00Z`
- **THEN** the app reports a parse error that names `2026-02-30T00:00:00Z` as not a valid timestamp

#### Scenario: Hour 24

- **WHEN** a metadata line contains `created:2026-09-15T24:00:00Z`
- **THEN** the app reports a parse error

### Requirement: Tag line position

The tag lines of an item SHALL follow the metadata line directly, and the fence SHALL follow the tag lines directly, without blank lines.

#### Scenario: Blank line before the tags

- **WHEN** a blank line separates the metadata line and the tag line `- vue`
- **THEN** the app reports a parse error

### Requirement: Tag line syntax

A tag line SHALL be `- NAME`, with one space and nothing after the name.

#### Scenario: Asterisk marker

- **WHEN** a tag line is `* DevOps`
- **THEN** the app reports a parse error

### Requirement: Duplicate tag lines

The parser SHALL report an error for an item that lists the same tag twice.

#### Scenario: Tag listed twice

- **WHEN** an item has the tag lines `- Cloud` and `- Cloud`
- **THEN** the app reports a parse error with the line number of the second tag line

### Requirement: Order of tag lines

WHEN the user adds a tag to an item, the app SHALL save the tag lines of the item in the order of the tag definitions.

#### Scenario: Tags added in reverse order

- **WHEN** the tags `Cloud` and `Security` are defined in this order, and the user adds `Security` and then `Cloud` to the item "Docker"
- **THEN** the file lists `- Cloud` and then `- Security` below the metadata line of "Docker"

### Requirement: Defined tags

Each tag that an item lists SHALL have a `tagdef` line above the first section.

#### Scenario: Undefined tag

- **WHEN** an item lists `- Cloud` and no `tagdef` line defines `Cloud`
- **THEN** the app reports a parse error

### Requirement: Tag case

The name in the `tagdef` line SHALL have the same case as the name in the tag line.

#### Scenario: Different case

- **WHEN** the `tagdef` line defines `Cloud` and an item lists `- cloud`
- **THEN** the app reports a parse error

### Requirement: Duplicate tag definitions

The parser SHALL report an error for two tag definitions that are equal, ignoring case.

#### Scenario: Two definitions of one name

- **WHEN** the file contains `<!-- tag:Cloud color:#aacbee -->` and `<!-- tag:cloud color:#f1c6c6 -->`
- **THEN** the app reports a parse error

### Requirement: Reserved tag name in the file

The parser SHALL report an error for a reserved tag name.

#### Scenario: Tag definition Uncategorized

- **WHEN** the file contains `<!-- tag:Uncategorized color:#aacbee -->`
- **THEN** the app reports a parse error

### Requirement: Tag color

A tag color SHALL be `#` and 6 lower-case hexadecimal digits.

#### Scenario: Short color

- **WHEN** a `tagdef` line contains `color:#abc`
- **THEN** the app reports a parse error

#### Scenario: Upper-case color

- **WHEN** a hand edit writes the tag color `#AACBEE`
- **THEN** the app reports a parse error

### Requirement: File without tags

A file without `tagdef` lines and without tag lines SHALL be valid.

#### Scenario: No tags

- **WHEN** the file has no `tagdef` line and no tag line
- **THEN** the app reads the file without a parse error

### Requirement: Description fence

A description SHALL be inside a fence that opens with N backticks and the word `markdown`, where N is 3 or more, and that closes with exactly N backticks.

#### Scenario: Fence too short

- **WHEN** an outer fence of 3 backticks contains an inner fence of 3 backticks
- **THEN** the inner fence closes the description early and the app reports a parse error with a line number

### Requirement: Fence tag

The parser SHALL reject a fence with the tag `md` and a fence without a tag.

#### Scenario: Wrong fence tag

- **WHEN** a fence opens with ` ```md `
- **THEN** the app reports a parse error

### Requirement: No empty fence

A fence SHALL contain at least one line that is not blank.

#### Scenario: Empty fence

- **WHEN** a fence contains only one blank line
- **THEN** the app reports a parse error

### Requirement: Blank lines at the edges of a description

The parser SHALL accept lines that contain only whitespace at the start and at the end of the text inside a fence.

#### Scenario: Empty line before the text

- **WHEN** a fence contains an empty line and then the line `Notes`
- **THEN** the app reads the description "Notes", and the next save writes the fence without the empty line

### Requirement: No fence for an item without a description

An item without a description SHALL have no fence.

#### Scenario: Save an item without a description

- **WHEN** the app saves an item with the status New and no description
- **THEN** the file contains no fence for that item

### Requirement: Text inside the fence

The parser SHALL read each line inside the fence as description text, also a heading line, a comment line, a `- NAME` line, or a blank line.

**Rationale**: GitHub shows the fence as a code box, so headings in a description do not change the outline of the file.

#### Scenario: Heading inside a description

- **WHEN** a description contains the line `## Notes`
- **THEN** the app reads `## Notes` as part of the description

#### Scenario: Tag line inside a description

- **WHEN** a description contains the line `- DevOps`
- **THEN** the app reads `- DevOps` as part of the description, and the item does not get the tag `DevOps`

### Requirement: Fence length on save

The app SHALL save the shortest fence that has more backticks than the longest run of backticks at the start of a line in the description, after at most 3 spaces.

#### Scenario: Code block in a description

- **WHEN** a description contains a line that starts with ` ```ts `
- **THEN** the app saves the description in a fence of 4 backticks

### Requirement: Longer fence

The parser SHALL accept a fence that is longer than the shortest fence.

#### Scenario: Long fence from a hand edit

- **WHEN** a hand edit uses a fence of 6 backticks around a description without backticks
- **THEN** the app accepts the file, and the next save uses a fence of 3 backticks

### Requirement: Closing fence line

The parser SHALL report an error for a closing line with more backticks than the opening fence, with indentation, or with trailing spaces.

**Rationale**: GitHub also closes a fence on such lines, so the file would show differently on GitHub.

#### Scenario: Trailing spaces

- **WHEN** the closing line of a fence is 3 backticks followed by 2 spaces
- **THEN** the app reports a parse error

### Requirement: Headlines

The parser SHALL report an error for a headline that contains `<!--`.

#### Scenario: Comment in a headline

- **WHEN** a headline line is `### Docker <!-- note -->`
- **THEN** the app reports a parse error

### Requirement: Spaces around a headline

The parser SHALL accept spaces before and after the text of a headline.

#### Scenario: Headline with extra spaces

- **WHEN** a hand edit writes the headline line `###  Docker  `
- **THEN** the app reads the headline "Docker", and the next save writes `### Docker`

### Requirement: Unique ids

Each item id SHALL be unique in the file.

#### Scenario: Duplicate id

- **WHEN** two items have the same id
- **THEN** the app reports a parse error

### Requirement: Upper-case item ids

The parser SHALL report an error for an item id with a lower-case letter.

**Rationale**: The app writes each id in upper case, so a lower-case id is a second way to write the same id.

#### Scenario: Lower-case id

- **WHEN** a hand edit writes the metadata line `<!-- id:01m3vxeyy3v9m2bmammk12gmbs created:2026-10-01T14:21:29Z -->`
- **THEN** the app reports a parse error

### Requirement: Line endings on save

The app SHALL save line endings as `\n`.

#### Scenario: Windows line endings

- **WHEN** the file uses `\r\n` line endings
- **THEN** the next save uses `\n` line endings

### Requirement: Windows line endings

The parser SHALL accept `\r\n` and SHALL convert each `\r\n` to `\n`.

#### Scenario: Read a file with Windows line endings

- **WHEN** the file uses `\r\n` line endings
- **THEN** the app reads the file without a parse error

### Requirement: Format version line

The first line of `learning.md` SHALL be `<!-- version:N -->`, where N is the format version.

#### Scenario: Missing version line

- **WHEN** a file with items has no version line
- **THEN** the app shows "learning.md has no version line. It is not a file that this app wrote."

#### Scenario: Byte order mark before the version line

- **WHEN** the file starts with a UTF-8 byte order mark and then `<!-- version:6 -->`
- **THEN** the app shows "learning.md has no version line. It is not a file that this app wrote."

### Requirement: Invalid version line

IF the first line of `learning.md` starts with `<!-- version:` and is not a valid version line for a format version of 2 or more, THEN the app SHALL show "Line 1 of learning.md is not a valid version line:" followed by the line.

**Rationale**: The app writes each version number in one way, so `version:02` is a hand edit and not a format version.

#### Scenario: Leading zero

- **WHEN** the first line of the file is `<!-- version:02 -->`
- **THEN** the app shows "Line 1 of learning.md is not a valid version line: <!-- version:02 -->" and saves nothing

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

### Requirement: Migration from version 0

The migration from format version 0 to 1 SHALL replace the content of the file with a version 1 file with 4 empty sections.

#### Scenario: Only whitespace

- **WHEN** the file contains only 2 empty lines
- **THEN** the migration writes the title `# Learning`, the version 1 comment, and the sections New, WIP, Complete, and Discarded without items

### Requirement: Migration from version 1

The migration from format version 1 to 2 SHALL replace the comment `<!-- learning-tracker: v1 … -->` below the title with the first line `<!-- version:2 -->`.

#### Scenario: Version 1 header

- **WHEN** a version 1 file starts with `# Learning` and the version 1 comment
- **THEN** the migration writes `<!-- version:2 -->` as the first line and `# Learning` as the title, without the comment

### Requirement: Migration from version 2

The migration from format version 2 to 3 SHALL replace each description block between the lines `<!-- desc -->` and `<!-- /desc -->` with a fence, with the fence length of the requirement "Fence length on save".

#### Scenario: Description block

- **WHEN** a version 2 item has the line `Notes` between `<!-- desc -->` and `<!-- /desc -->`
- **THEN** the migration writes `Notes` between the lines ` ```markdown ` and ` ``` `

### Requirement: Tags in the migration from version 3

The migration from format version 3 to 4 SHALL move the tags of an item from the `tags:` field of the metadata line to tag lines below the metadata line, in the same order.

#### Scenario: Two tags

- **WHEN** a version 3 metadata line contains `tags:DevOps,Security`
- **THEN** the migration removes the `tags:` field and adds the tag lines `- DevOps` and `- Security` below the metadata line

### Requirement: Plain dates in the migration from version 3

The migration from format version 3 to 4 SHALL add the time `T00:00:00Z` to each plain date in a metadata line.

#### Scenario: Plain creation date

- **WHEN** a version 3 metadata line contains `created:2026-09-16`
- **THEN** the migration writes `created:2026-09-16T00:00:00Z`

### Requirement: Colors in the migration from version 3

The migration from format version 3 to 4 SHALL write each tag color in lower case.

#### Scenario: Upper-case color

- **WHEN** a version 3 tag definition contains `color:#AACBEE`
- **THEN** the migration writes `color:#aacbee`

### Requirement: Empty fences in the migration from version 3

The migration from format version 3 to 4 SHALL remove each fence that contains only empty lines and lines of spaces.

#### Scenario: Fence with one empty line

- **WHEN** a version 3 item has a fence that contains only 1 empty line
- **THEN** the migration removes the fence, and the item has no description

### Requirement: New and WIP in the migration from version 3

The migration from format version 3 to 4 SHALL put each item without a description into the New section and each item with a description into the WIP section.

#### Scenario: Description in the New section

- **WHEN** a version 3 file has the item "Docker" with a description in the New section
- **THEN** the migration moves "Docker" to the WIP section

### Requirement: Order in the migration from version 3

WHEN the migration from format version 3 to 4 fills the New section and the WIP section, the migration SHALL first add the items from the old New section and then the items from the old WIP section, each in the old order.

#### Scenario: Two moved items

- **WHEN** the old New section contains "A" with a description, and the old WIP section contains "B" and "C", each with a description
- **THEN** the WIP section contains "A", "B", "C" in this order

### Requirement: Tag definition in the migration from version 4

The migration from format version 4 to 5 SHALL remove the tag definition with the name `Uncategorized`, ignoring case.

#### Scenario: Tag definition Uncategorized

- **WHEN** a version 4 file contains `<!-- tag:uncategorized color:#cfcac2 -->`
- **THEN** the migration removes the line

### Requirement: Tag lines in the migration from version 4

The migration from format version 4 to 5 SHALL remove each tag line with the name `Uncategorized`, ignoring case.

#### Scenario: Item with only the tag Uncategorized

- **WHEN** the version 4 item "Docker" has only the tag line `- Uncategorized`
- **THEN** the migration removes the tag line, and "Docker" has no tag

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

### Requirement: Upgrade commit

The app SHALL save the result of an upgrade as one commit with the subject "Upgrade learning.md from format vA to vB" and one body line `vX → vY: <step>` for each migration step, also WHEN the upgrade skips versions.

#### Scenario: Upgrade from version 3

- **WHEN** the app with format version 6 opens a version 3 file
- **THEN** the app saves 1 commit "Upgrade learning.md from format v3 to v6"

#### Scenario: Body lines

- **WHEN** the app with format version 6 opens a version 4 file
- **THEN** the commit body has 2 lines: `v4 → v5: remove the tag "Uncategorized", which is now a reserved name` and `v5 → v6: merge the WIP section into the New section`

### Requirement: Unsaved changes after an upgrade

The app SHALL save the unsaved changes in a separate commit after the upgrade commit.

#### Scenario: Change during an upgrade

- **WHEN** the user adds "Docker" while the upgrade from version 4 runs
- **THEN** the app saves the upgrade commit first and the commit `Add "Docker"` second

### Requirement: Upgrade status

WHILE an upgrade runs, the sync status box SHALL show "Upgrading learning.md…".

#### Scenario: Upgrade in progress

- **WHEN** the app opens a version 4 file and the upgrade commit is not saved yet
- **THEN** the sync status box shows "Upgrading learning.md…"

### Requirement: Failed upgrade

IF an upgrade fails, THEN the app SHALL show the error.

#### Scenario: Hand edit breaks an upgrade

- **WHEN** a version 3 file contains a hand edit that the migration cannot read
- **THEN** the app shows the error

### Requirement: No save after a failed upgrade

IF an upgrade fails, THEN the app SHALL save nothing.

#### Scenario: File stays unchanged

- **WHEN** the upgrade of a version 3 file fails
- **THEN** the file on GitHub stays a version 3 file

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

### Requirement: Save based on the read version

Each save, including an upgrade, SHALL be based on the version of the file that the app read.

#### Scenario: Two devices upgrade

- **WHEN** two devices upgrade the same file at the same time
- **THEN** GitHub accepts one save, and GitHub rejects the save of the other device

### Requirement: Read again after a rejected save

IF GitHub rejects a save because the file changed, THEN the app SHALL read the file again.

#### Scenario: Rejected upgrade

- **WHEN** GitHub rejects the upgrade save of device B, because device A upgraded the file first
- **THEN** device B reads the file again and finds a version 6 file

### Requirement: Retry limit of an upgrade

IF GitHub rejects the upgrade save 4 times because the file changed, THEN the app SHALL stop the upgrade and SHALL show "Could not upgrade learning.md. Will retry on the next load."

#### Scenario: Stale reads

- **WHEN** the app opens a version 1 file, and GitHub rejects each of 4 upgrade saves because the file changed
- **THEN** the app sends no fifth upgrade save and shows "Could not upgrade learning.md. Will retry on the next load."

### Requirement: Round-trip check

Before each save, the app SHALL parse the text that the app is about to save and SHALL compare the result with the in-memory data.

#### Scenario: Match

- **WHEN** the parsed text equals the in-memory data
- **THEN** the app saves the text

### Requirement: Round-trip mismatch

IF the parsed text differs from the in-memory data, THEN the app SHALL save nothing.

**Rationale**: The check stops a serializer bug before the bug reaches the file on GitHub.

#### Scenario: Mismatch

- **WHEN** the parsed text differs from the in-memory data
- **THEN** the app saves nothing and shows "Internal error: the change could not be safely written back. Nothing was committed."

### Requirement: Board after a round-trip mismatch

IF the round-trip check of a save fails, THEN the app SHALL remove the changes of that save from the board.

**Rationale**: The board then shows what GitHub has, and the user sees that the change was not saved.

#### Scenario: Mismatch after an add

- **WHEN** the user adds "Docker", and the round-trip check of the save fails
- **THEN** the board does not show "Docker"

### Requirement: Round-trip check for each kind of save

The round-trip check SHALL also run for the last save at page close and for a merged save.

#### Scenario: Merged save

- **WHEN** a merged save produces text that differs from the merged data
- **THEN** the app saves nothing and shows "Internal error: the merged change could not be safely written back. Nothing was committed."

### Requirement: Parse error

IF `learning.md` fails to parse, THEN the app SHALL show the error with a line number and a link to the file on github.com.

#### Scenario: Parse error

- **WHEN** line 12 of the file has an invalid metadata line
- **THEN** the app shows the error for line 12 with a link to the file

### Requirement: No save after a parse error

IF `learning.md` fails to parse, THEN the app SHALL block each save until a hand edit fixes the file.

#### Scenario: Change after a parse error

- **WHEN** line 12 of the file has an invalid metadata line
- **THEN** the app shows "All writes are blocked until the file is fixed by hand." and saves nothing

### Requirement: Unsaved changes during a parse error

IF a read finds a `learning.md` that fails to parse WHILE changes are unsaved, THEN the app SHALL keep the unsaved changes.

#### Scenario: Read after a rejected save

- **WHEN** the user changed the description of item A, GitHub rejects the save, and the read after the rejection finds a file that fails to parse
- **THEN** the board still shows the changed description of item A, and the app saves nothing

### Requirement: Save after a hand fix

WHEN a hand edit fixes a `learning.md` that failed to parse, the app SHALL save the unsaved changes that the app kept during the parse error.

#### Scenario: Hand fix that changes another item

- **WHEN** the app kept the unsaved change of the description of item A during a parse error, and the hand fix also changed the headline of item C
- **THEN** the app saves the description of item A and the headline of item C without asking

### Requirement: UTF-8 only

IF the file is not valid UTF-8, THEN the app SHALL show an error.

#### Scenario: Latin-1 file

- **WHEN** a hand edit saved the file as Latin-1
- **THEN** the app shows "learning.md is not valid UTF-8 text. Fix its encoding on GitHub first."

### Requirement: No save of an invalid UTF-8 file

IF the file is not valid UTF-8, THEN the app SHALL block each save.

#### Scenario: Latin-1 file blocks saves

- **WHEN** a hand edit saved the file as Latin-1
- **THEN** the app saves nothing

### Requirement: No replacement characters

The app SHALL NOT replace characters that the app cannot decode.

**Rationale**: The next save would destroy the characters that the app replaced.

#### Scenario: Latin-1 byte

- **WHEN** the file contains the Latin-1 byte `0xE9`
- **THEN** the app shows no text with the replacement character `�`

### Requirement: Size limit

IF the file is larger than 1 MB, THEN the app SHALL show an error.

**Rationale**: The GitHub Contents API does not return the content of files larger than 1 MB.

#### Scenario: File of 2 MB

- **WHEN** `learning.md` is 2 MB
- **THEN** the app shows "The file is larger than 1 MB, which the GitHub Contents API cannot read."
