# Testing Guide

This project uses a layered test strategy:

- Fast unit and component tests with Node's built-in test runner.
- Server and socket integration tests with mocked externals where needed.
- Real-browser output-window checks and large-history replays.

## Output windows and long sessions

After `npm run build` and `npx playwright install chromium firefox`, run
`npm run test:browser` for Chromium, Firefox, and a narrow touch layout.

To exercise Linux Chromium's actual scrollbar up-arrow, run
`xvfb-run -a npm run test:browser -- --project=chromium --headed --grep "native scrollbar up-arrow"`.
This headed check uses real mouse clicks on the browser control; it is skipped
in headless projects, where the native arrow is unavailable. Slow finger-scroll
checks use Chromium touch emulation, not an actual mobile app WebView.

`npm run test:output-performance` replays 20,000, 100,000, and 1,000,000 lines
and records mounted content, memory, and operation timings.

Channel-specific component and browser scenarios use the optional Sindome
example catalog. Separate checks cover the game-neutral default catalog and
its single Channels filter; the example catalog is not the production default.

Companion-window checks cover ownership handshakes, popup failure, native close
and redocking, shared indexes, cross-window Find and copying, background arrivals,
and lifecycle cleanup. Native-app visibility is checked using a bridge fixture;
browser touch emulation does not validate a real mobile app WebView.

Nowrap routing checks cover first-nonblank-line filtering, blank-only blocks,
streaming across network chunks, filter changes, split close/reopen, worker
fallback, clear/reconnect, whole-block pruning, and chronological log export.
Browser checks exercise Grid Output in both docked and companion windows,
including synchronized horizontal scrolling.

Presentation checks cover independent Main/Secondary fonts, sizes, and themes,
one-time defaults copied from Main, legacy and partial imports, validation,
reloads, reset, and the display-only note. Browser checks verify the nested tabs
with the keyboard, docked and popped-out styles, and unified logs using Main's
presentation. Secondary-only edits must preserve mounted Main rows and both
history indexes.

Regression checks cover cross-origin companion navigation with unload
notifications unavailable (including an empty paused pane), URL-supplied
secondary settings through export/import/reload, and actual standalone log line
geometry at 24pt with embedded and linked stylesheets. Editor-list checks compare
single-chunk and multi-chunk IDE payloads, live/closed individual windows, and
cancelled replacement of an existing window.

See [Output performance](OUTPUT-PERFORMANCE.md) for optional local-log fixtures,
reference measurements, acceptance checks, and the distinction between retained
history and rendered rows. The player/operator guide is
[Output windows](OUTPUT-WINDOWS.md).

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

- `test/views/views.test.js`
