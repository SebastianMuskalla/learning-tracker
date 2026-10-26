# setup Specification

## Purpose

Connects the app to the user's `learning.md` file in a private data repository on GitHub, through a
fine-grained token, and lets the user install the app.

## Requirements

### Requirement: Access through a fine-grained token

The app SHALL read and save `learning.md` through the GitHub API with a fine-grained personal access token that the user enters.

**Rationale**: The app has no backend server, and a token limited to one repository gives only the access that the app needs.

#### Scenario: Minimal token permissions are enough

- **WHEN** the token has "Contents: Read and write" on the data repository only, and "No access" for each other permission
- **THEN** the app reads and saves `learning.md` without errors

### Requirement: No sign-in with a GitHub account

The app SHALL NOT offer a sign-in with a GitHub account.

#### Scenario: Setup screen without sign-in

- **WHEN** the app shows the setup screen
- **THEN** the setup screen shows no button for a sign-in with GitHub

### Requirement: Setup screen

WHEN the browser stores no connection settings, the app SHALL show the setup screen with the fields "Owner", "Repository", "Branch", "Path", and "Personal access token".

#### Scenario: First start

- **WHEN** the user opens the app for the first time
- **THEN** the app shows the setup screen

### Requirement: Unusable stored settings

IF the browser stores connection settings that the app cannot read, or that have an empty owner or an empty repository, THEN the app SHALL show the setup screen with the branch `main` and the path `learning.md`.

#### Scenario: Damaged settings

- **WHEN** the stored connection settings are the text `{not json`
- **THEN** the app shows the setup screen with an empty "Owner" field, the branch `main`, and the path `learning.md`

### Requirement: Owner and repository name validation

The setup screen SHALL accept an owner name and a repository name only WHEN each name is not empty and contains only ASCII letters, digits, `.`, `_`, and `-`.

#### Scenario: Invalid repository name

- **WHEN** the user enters the repository name `my data`
- **THEN** the setup screen shows "Owner and repository may only contain letters, digits, ".", "_" and "-"."

### Requirement: Connection test

WHEN the user clicks **Test connection**, the setup screen SHALL show the result of a read of the file at the given owner, repository, branch, and path.

#### Scenario: Successful test

- **WHEN** the settings point to an existing `learning.md` with 1200 characters and the token is valid
- **THEN** the setup screen shows "Connected — read 1200 characters."

### Requirement: Connection test with HTTP 404

IF the read of the connection test returns HTTP 404, THEN the setup screen SHALL show "Connected — the file does not exist yet, or the owner, repository, branch, or token is wrong."

**Rationale**: GitHub returns HTTP 404 for a missing file, and also for a wrong owner, repository, or branch, and for a token without access to the data repository.

#### Scenario: Test with a missing file

- **WHEN** the settings point to a path that does not exist in the data repository
- **THEN** the setup screen shows "Connected — the file does not exist yet, or the owner, repository, branch, or token is wrong."

### Requirement: Path to a folder

IF the configured path points to a folder in the data repository, THEN the app SHALL show an error that contains "The path points to a folder, not a file."

#### Scenario: Folder path

- **WHEN** the configured path is `notes`, and `notes` is a folder in the data repository
- **THEN** the app shows an error that contains "The path points to a folder, not a file."

### Requirement: Create a missing data file

IF the file at the configured path does not exist, THEN the app SHALL offer to create the file.

**Rationale**: The user can skip the step "add `learning.md`" during setup.

#### Scenario: File does not exist

- **WHEN** the configured path does not exist in the data repository
- **THEN** the app offers to create `learning.md` with the commit message "Initialize learning.md"

### Requirement: No new item while the data file is missing

WHILE the file at the configured path does not exist, the app SHALL NOT add an item.

**Rationale**: The user creates the file with the offer first, so the first commit is always "Initialize learning.md".

#### Scenario: Item field while the file is missing

- **WHEN** the configured path does not exist in the data repository
- **THEN** the "Item" field and the **Add** button of the header bar are disabled

#### Scenario: Item field after the file is created

- **WHEN** the user accepts the offer to create `learning.md`
- **THEN** the "Item" field and the **Add** button of the header bar are enabled

### Requirement: Changes before the missing file is found

IF the user made a change before the app found that the file does not exist, THEN the app SHALL save the change after the commit "Initialize learning.md", in a separate commit.

#### Scenario: Item added during the first read

- **WHEN** the user adds "Docker" while the app reads the file for the first time, and the file does not exist
- **THEN** the app saves nothing until the user accepts the offer, and then saves "Initialize learning.md" first and `Add "Docker"` second

### Requirement: Empty file

The app SHALL accept an empty `learning.md` as a valid file.

#### Scenario: Empty file

- **WHEN** `learning.md` exists and is empty
- **THEN** the app reads the file without a parse error and shows a board with 4 empty sections

### Requirement: Settings change with unsaved changes

WHEN the user switches to another repository, branch, or path WHILE unsaved changes exist, the app SHALL first save the unsaved changes to the old file.

#### Scenario: Save to the old file

- **WHEN** the user changes the branch from `main` to `notes` while one change is unsaved
- **THEN** the app saves the change on the branch `main` before the app reads the file on the branch `notes`

### Requirement: Failed save before a settings change

IF the save to the old file fails, THEN the app SHALL stay on the old file and SHALL show the reason.

#### Scenario: Save to the old file fails

- **WHEN** the user changes the branch while one change is unsaved and the save to the old file fails
- **THEN** the app keeps the old settings and shows the reason for the failure

### Requirement: Token rejected

IF a GitHub API request returns HTTP 401 or HTTP 403, THEN the app SHALL show the setup screen with a message that explains the cause.

#### Scenario: Expired token

- **WHEN** a save returns HTTP 401
- **THEN** the app shows the setup screen with "The token was rejected (401). Check it on the settings screen."

#### Scenario: Read-only token

- **WHEN** a save returns HTTP 403 because the token has read-only access to Contents
- **THEN** the app shows the setup screen with "The token cannot write to this repository (403). Check that Contents is set to "Read and write"."

### Requirement: Unsaved changes after a rejected token

IF a GitHub API request returns HTTP 401 or HTTP 403, THEN the app SHALL keep the unsaved changes and SHALL save the unsaved changes with the new token.

**Rationale**: A token can expire, the user can revoke a token, and a token can lack write access; in each case the user keeps the work.

#### Scenario: New token after an expired token

- **WHEN** a save returns HTTP 401 while 2 changes are unsaved, and the user then enters a valid token
- **THEN** the app saves the 2 changes

### Requirement: Installable web app

The app SHALL provide a web app manifest with a name and square icons of 192 px and 512 px, so that a browser can install the app.

#### Scenario: Install in Chrome

- **WHEN** the user installs the site in Chrome
- **THEN** the app opens in its own window with the app icon

### Requirement: No service worker

The app SHALL NOT register a service worker.

**Rationale**: Offline use is out of scope; each read and save needs the GitHub API.

#### Scenario: Open the app offline

- **WHEN** the network is down and the user opens the app
- **THEN** the browser shows its own offline page

### Requirement: Default base path

The build SHALL serve the app from `/learning-tracker/` by default.

#### Scenario: Default repository name

- **WHEN** the repository variable `VITE_BASE` is not set
- **THEN** the deployed app loads from `https://<owner>.github.io/learning-tracker/`

### Requirement: Configurable base path

WHEN the build variable `VITE_BASE` is set, the build SHALL use the value of `VITE_BASE` as the base path.

#### Scenario: Other repository name

- **WHEN** the repository variable `VITE_BASE` is `/my-tracker/`
- **THEN** the deployed app loads from `https://<owner>.github.io/my-tracker/`
