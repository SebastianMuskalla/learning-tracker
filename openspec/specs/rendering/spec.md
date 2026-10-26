# rendering Specification

## Purpose

Shows item descriptions as rendered Markdown in the detail view, including code blocks with syntax
highlighting, and as short previews on the cards.

## Requirements

### Requirement: Markdown descriptions

The detail view SHALL render each description as Markdown.

#### Scenario: Heading in a description

- **WHEN** a description contains the line `## Notes`
- **THEN** the detail view shows "Notes" as a heading

### Requirement: Code block box

The detail view SHALL show each code block in a box with a tinted background, for a fenced code block and for an indented code block.

#### Scenario: Code block without language

- **WHEN** a description contains a fenced code block without a language name
- **THEN** the detail view shows the code in a box without a language label and without colors

#### Scenario: Indented code block

- **WHEN** a description contains a line `    indented code` after a blank line
- **THEN** the detail view shows `indented code` in a box without a language label

### Requirement: Language label

WHEN a fenced code block names a language after the opening fence, the detail view SHALL show the language name at the top of the box.

#### Scenario: Unsupported language

- **WHEN** a code block opens with ` ```cobol `
- **THEN** the box shows the label "cobol" and no colors

### Requirement: Syntax highlighting

WHEN a fenced code block names a supported language after the opening fence, the detail view SHALL color the code with colors that match the active theme.

#### Scenario: TypeScript block

- **WHEN** a code block opens with ` ```ts `
- **THEN** the box shows the label "TypeScript" and colored code

### Requirement: Supported languages

The supported languages SHALL be the "common" language set of highlight.js.

**Rationale**: The "common" set of highlight.js covers the usual languages and keeps the bundle small.

#### Scenario: Python block

- **WHEN** a code block opens with ` ```python `
- **THEN** the box shows colored code

### Requirement: No language guessing

The app SHALL NOT guess the language of a code block.

**Rationale**: A guessed language can be wrong, and a wrong color scheme is worse than no colors.

#### Scenario: TypeScript code without a language name

- **WHEN** a code block without a language name contains `const x: number = 1;`
- **THEN** the box shows the code without colors

### Requirement: Code without the highlighter

IF the app cannot load the syntax highlighter, THEN the detail view SHALL show each code block without colors.

**Rationale**: A tab that was open during a new deploy cannot load the highlighter of the old build, and the description stays readable.

#### Scenario: Tab from before a deploy

- **WHEN** the highlighter fails to load and a description contains a code block that opens with ` ```ts `
- **THEN** the detail view shows the code in the box, without colors and without an error

### Requirement: Card preview

Each card SHALL show a preview of the description that is clipped to 4 lines.

#### Scenario: Long description

- **WHEN** a description has 10 lines
- **THEN** the card shows the first 4 lines

### Requirement: Code in the card preview

The card preview SHALL show code as plain text, without a box.

#### Scenario: Code in a card preview

- **WHEN** a description starts with a fenced code block that contains `const x = 1;`
- **THEN** the card shows `const x = 1;` as plain text, without a box
