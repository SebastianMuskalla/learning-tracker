# Spec Delta

## MODIFIED Requirements

### Requirement: Position of a moved item after a rejected save

IF GitHub rejected a save, THEN the app SHALL keep the position of the user for each item that the user added or moved to another section.

#### Scenario: Restore and a change to another item

- **WHEN** the user restored the discarded item "Docker" with a description, another device changed the headline of a New item, and GitHub rejects the save
- **THEN** "Docker" is first in the New section
