# security Specification

## Purpose

Protects the user's token and the user's browser session against leaks and against content in
descriptions.

## Requirements

### Requirement: Token sent only to GitHub

The app SHALL send the token only to `https://api.github.com`.

#### Scenario: Request with the token

- **WHEN** the app reads `learning.md`
- **THEN** the app sends the token in a request to `https://api.github.com` and in no other request

### Requirement: Connections only to GitHub

A Content-Security-Policy in `index.html` SHALL allow the scripts of the page to connect only to `https://api.github.com`.

**Rationale**: The browser then blocks each other destination of a script request, by accident or by attack.

#### Scenario: Request to another host

- **WHEN** code in the page tries to connect to `https://example.com`
- **THEN** the browser blocks the request

### Requirement: External images

The Content-Security-Policy SHALL allow images from each HTTPS host.

**Rationale**: A description can show an image from the web; an image request carries no token, but the image host learns that the page loaded the image.

#### Scenario: Image in a description

- **WHEN** a description contains `![Diagram](https://example.com/diagram.png)`
- **THEN** the detail view shows the image from `https://example.com`

### Requirement: Strict policy in development

The development server SHALL use the same Content-Security-Policy as the production build.

**Rationale**: The policy that protects the live app is also tested locally; the expected cost is 2 console warnings and no automatic reload in development.

#### Scenario: Development server

- **WHEN** the developer runs `pnpm dev` and saves a file
- **THEN** the page does not reload automatically

### Requirement: Token never in URL, code, or commit

The app SHALL NOT write the token into a URL, into the app code, or into a commit.

#### Scenario: Commit content

- **WHEN** the app saves a commit
- **THEN** the commit does not contain the token

### Requirement: Token storage

The app SHALL store the token in the browser's `localStorage`.

**Rationale**: A stolen token gives read and write access to one file in one private repository only.

#### Scenario: Reload keeps the token

- **WHEN** the user enters a token and reloads the page
- **THEN** the app reads `learning.md` without asking for the token again

### Requirement: Blocked storage

IF the browser blocks `localStorage`, THEN the app SHALL start and SHALL keep the token in memory only.

#### Scenario: Blocked storage

- **WHEN** the browser blocks `localStorage` and the user enters a token
- **THEN** the app reads `learning.md` with the token

### Requirement: Blocked storage message

IF the browser blocks `localStorage`, THEN the app SHALL tell the user to enter the token again after a reload.

#### Scenario: Blocked storage message

- **WHEN** the browser blocks `localStorage` and the user enters a token
- **THEN** the app shows "The settings could not be saved in this browser; you will need to enter them again after a reload."

### Requirement: No raw HTML

The app SHALL render descriptions with raw HTML disabled.

#### Scenario: HTML tag in a description

- **WHEN** a description contains `<b>bold</b>`
- **THEN** the detail view shows the text `<b>bold</b>` and no bold text

### Requirement: Sanitized Markdown

The app SHALL sanitize the rendered HTML before the app shows the HTML.

#### Scenario: Script in a description

- **WHEN** a description contains `<script>alert(1)</script>`
- **THEN** the detail view does not run the script

### Requirement: External links

Each link in a description SHALL open in a new tab with `rel="noopener noreferrer"`.

#### Scenario: Click a link

- **WHEN** the user clicks a link in a description
- **THEN** the link opens in a new tab without access to the app page
