@README.md

Each task you get is one of two types: Planning or Implementation.

# General rules

- `README.md` is the single source of documentation for this project.
- Write all documentation (`README.md`, code comments, and other files like `plan.md`) in Simplified Technical English (ASD-STE100).

# Rules for planning

- You get a rough requirement from the prompt or the task to read `prompt.md` in the repository root.
- The goal is to write `plan.md` in the repository root.
- Treat all other files as read-only.
- `plan.md` should contain:
  - A short description of the requirement in 5 sentences or less.
  - A detailed description of the requirements, including all edge cases.
  - A detailed implementation plan in the form of a checklist.
- If the handling of an edge case is unclear, check with the user or make this risk apparent to the user instead of guessing what the correct behavior should be.
- You don't need to run `pnpm check` in this step.

# Rules for implementation

- You get the input from the prompt or the task to read `plan.md` in the repository root.
- Proceed with the implementation as described.
- If the implementation plan contains a checklist, mark the items as completed as you go.
- You may modify the implementation plan if needed.
- You may not modify the requirements without checking with the user first.
- The task is only complete once all requirements are implemented and when all tasks on the checklist (if present) are completed.
- When adding third-party libraries, use the latest stable release unless `README.md` pins a version (see Development).
- Consider if the implementation has introduced a breaking change to the storage file (`learning-data.md`).
  In that case, use the versioning mechanism and write a migration as outlined in `README.md`.
  Document the new version there and fill out the commit hashes as far as possible.
- `prompt.md` and `plan.md` are not tracked in the git repository.
  `README.md` needs to contain all information that is needed for the long-term health of the project.
  Before finalizing a task, check if `README.md` still matches the code and architecture and update it if needed.
- Before finalizing any task, run `pnpm check`. The task is only complete when every step passes.
  Fix errors properly. Do not remove tests, linters, or linting rules just to make a step pass.
