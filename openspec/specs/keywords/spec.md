# keywords Specification

## Purpose

Takes keywords from the headlines of items with the status Complete and links each occurrence of a keyword in other
descriptions to the item that explains the keyword.

## Requirements

### Requirement: Keyword source

The app SHALL take the keywords of each item from the headline of the item WHEN the app runs.

**Rationale**: The user does not maintain a separate keyword list.

#### Scenario: Renamed headline

- **WHEN** the user changes the headline of a Complete item from `Docker` to `Podman`, and another description contains "Podman"
- **THEN** the detail view of the other item shows a keyword link for "Podman"

### Requirement: Keywords not in the file

`learning.md` SHALL NOT store keywords.

#### Scenario: Save without keywords

- **WHEN** the app saves `learning.md` with the Complete item `OWASP`
- **THEN** the file contains the headline `OWASP` and no separate keyword line

### Requirement: Only Complete items create links

Only the keywords of items with the status Complete SHALL create keyword links.

**Rationale**: An item explains a term only after the item is complete.

#### Scenario: Item with the status WIP

- **WHEN** the headline of an item with the status WIP is `OWASP` and another description contains "OWASP"
- **THEN** the detail view shows no keyword link for "OWASP"

### Requirement: Remove parentheses

The app SHALL remove each group in parentheses, with the content and the nested groups of the group, from the headline before the app takes the keywords.

#### Scenario: Acronym with long form

- **WHEN** the headline is `OWASP (Open Worldwide Application Security Project)`
- **THEN** the keyword is `OWASP`

### Requirement: Cut at a colon

The app SHALL cut the headline at the first colon that has a space after the colon or that is the last character of the headline, and SHALL NOT cut at a colon without a space after the colon.

#### Scenario: Colon with space

- **WHEN** the headline is `Risk: Risk assessment, Risk handling`
- **THEN** the only keyword is `Risk`

#### Scenario: Colon without space

- **WHEN** the headline is `std::vector`
- **THEN** the keyword is `std::vector`

### Requirement: Split at comma and semicolon

The app SHALL split the remaining headline into parts at each `,` and `;`, and SHALL NOT split at `/`.

#### Scenario: Two keywords

- **WHEN** the headline is `CI, CD`
- **THEN** the keywords are `CI` and `CD`

#### Scenario: Slash

- **WHEN** the headline is `CI/CD`
- **THEN** the keyword is `CI/CD`

### Requirement: Drop invalid parts

The app SHALL drop a part that has fewer than 2 characters without counting spaces, a part without a letter or a digit, and a part with a parenthesis without a partner.

#### Scenario: Part without letter or digit

- **WHEN** the headline is `++, Foo (bar`
- **THEN** the headline gives no keyword

### Requirement: Drop repeated parts

The app SHALL drop a part that is the same keyword as an earlier part of the same headline.

#### Scenario: Same keyword twice in one headline

- **WHEN** the headline is `Risk assessment, risk-assessment`
- **THEN** the only keyword is `Risk assessment`

### Requirement: Keyword list in the detail view

The detail view SHALL show the keywords of the open item below the headline, as "Linked as:".

#### Scenario: Open an item

- **WHEN** the user opens the item with the headline `CI, CD`
- **THEN** "Linked as:" shows `CI` and `CD`

### Requirement: Keyword list while typing

WHILE the user edits the headline, the detail view SHALL update the "Linked as:" list after each keystroke.

#### Scenario: Typing a headline

- **WHEN** the user changes the headline from `CI` to `CI, CD`
- **THEN** "Linked as:" shows `CI` and `CD`

### Requirement: Note for an item that is not Complete

WHILE the open item does not have the status Complete and the headline gives at least one keyword, the "Linked as:" list SHALL show "Other items link here only when this item is complete."

#### Scenario: WIP item

- **WHEN** the user opens the WIP item `Source`
- **THEN** "Linked as:" shows `Source` and the note "Other items link here only when this item is complete."

### Requirement: Headline without keywords

IF the headline of the open item gives no keyword, THEN the detail view SHALL show "Not linked: the headline has no keyword with 2 or more characters." instead of the "Linked as:" list.

#### Scenario: Headline only in parentheses

- **WHEN** the user changes the headline to `(only)`
- **THEN** the detail view shows "Not linked: the headline has no keyword with 2 or more characters."

### Requirement: Case matching

A keyword with an upper-case letter after the first character of a word SHALL match exactly as written, or in Title case.

**Rationale**: Acronyms such as `IT` are also common words in other cases.

#### Scenario: Acronym in Title case

- **WHEN** the keyword is `OWASP`
- **THEN** the keyword matches "OWASP" and "Owasp", and does not match "owasp"

### Requirement: Case matching of two-character keywords

A keyword with exactly 2 characters, not counting spaces, SHALL match only exactly as written.

**Rationale**: Short keywords such as `Go` are also common words in other cases.

#### Scenario: Two-character keyword

- **WHEN** the keyword is `IT`
- **THEN** the keyword does not match "It"

#### Scenario: Two characters with a space

- **WHEN** the keyword is `A B`
- **THEN** the keyword matches "A B" and does not match "a b"

### Requirement: Case matching of other keywords

Each other keyword SHALL match ignoring case.

#### Scenario: Plain keyword

- **WHEN** the keyword is `Docker`
- **THEN** the keyword matches "docker"

### Requirement: Spaces and hyphens

A space or a hyphen between two characters of a keyword SHALL match one or more spaces or line breaks, one hyphen, or nothing; a hyphen at the start or the end of a keyword SHALL match only a hyphen; and each other character SHALL match exactly.

#### Scenario: Hyphen and no space

- **WHEN** the keyword is `Risk assessment`
- **THEN** the keyword matches "risk-assessment" and "RiskAssessment"

#### Scenario: Hyphen at the start

- **WHEN** the keyword is `-flag` and the text is "use -flag and flag"
- **THEN** the keyword matches "-flag" and does not match the second "flag"

### Requirement: Plurals

A keyword SHALL also match with `s` or `es` directly after the keyword, in lower case only.

#### Scenario: Plural of an acronym

- **WHEN** the keyword is `API`
- **THEN** the keyword matches "APIs" and does not match "APIS"

### Requirement: Word edges

A letter or a digit directly before or after a match SHALL prevent the match, and each other character directly before or after a match SHALL allow the match.

#### Scenario: Punctuation around a keyword

- **WHEN** the keyword is `OWASP`
- **THEN** the keyword matches in "OWASP-based", "OWASP's", and "pre-OWASP-era", and does not match in "OWASPX"

#### Scenario: Digit after a keyword

- **WHEN** the keyword is `C#`
- **THEN** the keyword does not match in "C#5"

### Requirement: Overlapping matches

IF two matches overlap, THEN the longer match SHALL win.

#### Scenario: Longer keyword

- **WHEN** Complete items exist for `Risk` and `Risk assessment`, and a description contains "Risk assessment"
- **THEN** "Risk assessment" links to the item `Risk assessment`

### Requirement: Overlapping matches of the same length

IF two overlapping matches have the same length, THEN the match that starts first SHALL win, and for the same start the match without a plural suffix SHALL win.

#### Scenario: Keyword and plural keyword

- **WHEN** Complete items exist for `Risk` and `Risks`, and a description contains "Risks"
- **THEN** "Risks" links to the item `Risks`

### Requirement: Same keyword

Two keywords SHALL count as the same WHEN the keywords are equal after the app ignores case, spaces, and hyphens.

#### Scenario: Plural is different

- **WHEN** the Complete items `Risk` and `Risks` exist
- **THEN** the keywords are not the same

### Requirement: Same keyword in two items

IF two items with the status Complete give the same keyword, THEN the app SHALL NOT link that keyword.

#### Scenario: Conflict

- **WHEN** the Complete items `Risk assessment` and `risk-assessment` exist
- **THEN** the app links neither keyword

### Requirement: Warning for the same keyword

The "Linked as:" list of each item that gives the same keyword as another item with the status Complete SHALL show the warning "Also used by "…" — not linked.", also for an item that does not have the status Complete.

**Rationale**: The user sees the conflict before completing the second item.

#### Scenario: Warning on a WIP item

- **WHEN** the Complete item `Risk assessment` and the WIP item `risk-assessment` exist
- **THEN** the "Linked as:" list of `risk-assessment` shows "Also used by "Risk assessment" — not linked."

### Requirement: Where links appear

The app SHALL show keyword links only in the rendered description of the detail view: the read-only view and the live preview.

#### Scenario: Keyword on a card

- **WHEN** a description contains "OWASP" and the Complete item `OWASP` exists
- **THEN** the card shows no keyword link, and the detail view shows a keyword link for "OWASP"

### Requirement: No links in code or links

The app SHALL NOT create keyword links in code or inside an existing link.

#### Scenario: Keyword in code

- **WHEN** a keyword occurs inside inline code in a description
- **THEN** the detail view shows no keyword link for that occurrence

### Requirement: No link to the same item

An item SHALL NOT link to itself.

#### Scenario: Own headline in the description

- **WHEN** the description of the Complete item `OWASP` contains "OWASP"
- **THEN** the detail view of `OWASP` shows no keyword link for "OWASP"

### Requirement: Link presentation

The detail view SHALL show a keyword link with a dashed underline.

#### Scenario: Dashed underline

- **WHEN** a description contains "Docker" and the Complete item `Docker` exists
- **THEN** the detail view shows "Docker" with a dashed underline

### Requirement: Link tooltip

WHEN the pointer is on a keyword link, or the keyword link has keyboard focus, a tooltip SHALL show the headline of the target item and the start of the description of the target item, clipped to a height of 12 em.

#### Scenario: Hover

- **WHEN** the pointer is on a keyword link
- **THEN** a tooltip shows the headline of the target item and the start of the description of the target item

### Requirement: Tooltip delay

The tooltip of a keyword link SHALL appear 300 ms after the pointer moves onto the keyword link, and at once WHEN the keyword link gets keyboard focus.

**Rationale**: The delay keeps the tooltip from flashing while the pointer crosses the text.

#### Scenario: Pointer

- **WHEN** the pointer moves onto a keyword link
- **THEN** no tooltip shows for 300 ms, and then the tooltip shows

#### Scenario: Keyboard focus

- **WHEN** a keyword link gets keyboard focus
- **THEN** the tooltip shows at once

### Requirement: Follow a link

WHEN the user clicks a keyword link, clicks a keyword link with the middle mouse button, or presses Enter or Space on a keyword link, the detail view SHALL show the target item.

#### Scenario: Keyboard

- **WHEN** a keyword link to `Docker` has keyboard focus and the user presses Enter
- **THEN** the detail view shows the item `Docker`

#### Scenario: Middle click

- **WHEN** the user clicks a keyword link to `Docker` with the middle mouse button
- **THEN** the detail view shows the item `Docker`

### Requirement: Follow a link on a touch screen

WHEN the user taps a keyword link on a touch screen, the detail view SHALL show the target item at once.

#### Scenario: Tap

- **WHEN** the user taps a keyword link to `Docker` on a touch screen
- **THEN** the detail view shows the item `Docker` without a tooltip first

### Requirement: Filters unchanged after following a link

WHEN the user follows a keyword link, the app SHALL NOT change the search or the tag filter, also WHEN the search or the tag filter hides the target item on the board.

#### Scenario: Target item hidden by the tag filter

- **WHEN** the tag filter hides the target item and the user clicks a keyword link to the target item
- **THEN** the detail view shows the target item and the tag filter does not change

### Requirement: Regular plurals only

A keyword SHALL match only the regular plurals with `s` and `es`.

#### Scenario: Irregular plural

- **WHEN** the keyword is `Policy`
- **THEN** the keyword does not match "Policies"

### Requirement: Missing space or hyphen

A keyword without a space or a hyphen SHALL NOT match text with a space or a hyphen at that position.

**Rationale**: This limit keeps matching predictable; the user can write `X-Ray` as the keyword to match each form.

#### Scenario: Hyphen in the text only

- **WHEN** the keyword is `XRay`
- **THEN** the keyword does not match "X-Ray"

### Requirement: No match across formatting

A keyword SHALL NOT match across Markdown formatting.

#### Scenario: Formatting inside a match

- **WHEN** the keyword is `Risk assessment` and the text is "Risk _assessment_"
- **THEN** the keyword does not match
