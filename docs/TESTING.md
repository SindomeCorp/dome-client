# Testing Guide

This project uses a layered test strategy:

- Fast unit and component tests with Node's built-in test runner.
- Server and socket integration tests with mocked externals where needed.

## Requirements

- Node.js 22+
- npm

## Core Checks

Run lint + default test suite:

```bash
npm run lint
npm test
```

Default `npm test` includes:

- View template linting (`npm run lint:views`)
- Unit tests
- Integration tests under `test/integration`
- Client-side jsdom-based tests

## Focused Test Commands

Run integration tests only:

```bash
npm run test:integration
```

Find slow tests:

```bash
npm run test:find-slow
```

Run only view rendering tests:

```bash
npm run test:views
```

Enforce coverage thresholds:

```bash
npm run coverage
```

Coverage must remain at or above:

- 80% lines
- 80% functions
- 80% statements

## Test Authoring Notes

- Keep tests deterministic and isolated.
- Mock external HTTP calls with `nock`.
- Prefer avoiding real filesystem writes in unit tests.
- Use module mocks for server wiring tests where appropriate.

When adding new views that require locals, update representative locals in:

- `test/views.test.js`
