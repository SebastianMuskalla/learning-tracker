# Spec Delta

## MODIFIED Requirements

### Requirement: Section count during a search

WHILE the search bar is not empty, each section count SHALL read "x of y", where x is the number of shown items and y is the number of items in the section.

#### Scenario: Section count

- **WHEN** the search matches 2 of the 5 items in the New section
- **THEN** the section count of the New section reads "2 of 5"
