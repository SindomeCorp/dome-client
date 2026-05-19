# Agent Guidelines

## Conventions
- Use two spaces for indentation.
- Prefer double quotes for strings and end statements with semicolons.
- Write all new modules and tests using ECMAScript modules (`import`/`export`).
- Keep functions small and document complex logic with inline comments.
- Avoid committing secrets; rely on environment variables for configuration.

## Environment
- Define and validate variables in src/env.js using envalid.
- Reflect new variables in .env-example-*, tests, and README.md.

## Changelog
- Always update `docs/CHANGELOG.md` when you add a feature, fix a bug, or make a user-visible enhancement.
- Add new entries at the top of the file under the current date in `YYYY-MM-DD` format. If that date section does not exist, create it directly above older entries.
- Group entries under the existing headings when applicable (`Added`, `Changed`, `Fixed`, `Removed`) and keep bullets concise, specific, and user-facing.
- Do not delete or rewrite historical entries unless explicitly requested; only prepend or append the new relevant notes for the current change.

## Logging
- Use the shared Winston logger in src/logger.js for all output.
- Select appropriate log levels (error, warn, info, etc.) with logger.*.
- Never use console.*; adjust LOG_LEVEL via environment variables.

## Testing
- Write tests for new features using Node's built-in test runner and ECMAScript modules.
- Mock external HTTP calls with nock and API requests with supertest.
- Keep unit tests fast by using mocks and mocked data where possible; avoid modifying the real file system.
- Run npm run lint and npm test before committing. Coverage must stay at or above 80%.

## Commit Messages
- Write concise, present-tense commit messages that describe the change.
