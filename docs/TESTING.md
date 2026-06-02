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

Run mutation testing profile (full critical-module set):

```bash
npm run test:mutation
```

Run mutation testing for hotspot files only (faster iteration):

```bash
npm run test:mutation:hot
```

This runs Stryker with:

- `stryker.hot.conf.json` as the run config (mutates only `socket.js` and `status.js`)

Warm the incremental cache with a tiny mutated file (fast prep before a longer run):

```bash
npm run test:mutation:warm
```

Enforce coverage thresholds:

```bash
npm run coverage
```

Coverage must remain at or above:

- 80% lines
- 80% functions
- 80% statements

Mutation testing notes:

- The configured profile targets high-risk server modules and can take significant time to complete.
- `npm run test:mutation` is an alias for `npm run test:mutation:full`.
- Use `test:mutation:hot` while developing tests, then `test:mutation:full` to confirm final score.
- Keep `reports/stryker-incremental.json` to speed up future reruns.
- JSON reports are written to `reports/mutation/mutation.json`.

## Test Authoring Notes

- Keep tests deterministic and isolated.
- Mock external HTTP calls with `nock`.
- Prefer avoiding real filesystem writes in unit tests.
- Use module mocks for server wiring tests where appropriate.

When adding new views that require locals, update representative locals in:

- `test/views.test.js`
