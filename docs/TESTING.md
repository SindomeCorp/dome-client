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

The input-focus regression models Firefox advancing the output viewport while
new content increases its scroll range. Following output must remain active;
real upward movement must still pause, and input clicks/double-clicks must not
toggle either pane. To run it with Firefox's native window focus behavior, use
`xvfb-run -a npm run test:browser -- --project=firefox --headed --grep "input clicks do not pause"`.

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

## Context menus in Firefox and Chromium

After `npm run build`, run `npm run test:browser -- --project=chromium --project=firefox --grep "context menus:"`. Use headed mode under Xvfb for tests that need native window or clipboard behavior.
`browser-tests/context-menus.spec.js` exercises ANSI-split pointer targets,
keyboard menus and viewport clamping, secondary/companion selections, profile
Options/import/reload, and unsaved IDE scratch tabs with explicit Save. The
`?entry=real` fixture serves the actual built `player-client.js` and IDE bundles;
its loopback Socket.IO endpoint records inputs and simulates transport reconnects
without connecting to a MOO. Other output cases retain their selective fixture
for direct virtual-history inspection. The reverse 2,000-line selection case
checks partial endpoints through real Clipboard API Copy and the IDE; the
existing native Copy/paste baseline remains separate and unchanged.

Reuse checks exercise the shipped worker's RegExp construction, repeated rows,
`lastIndex` isolation after success/errors, profile switching, and valid/invalid
reloads. A real-bundle browser case also captures the open reference menu over
synthetic output to `tmp/context-menu-review/open-reference-menu.png`. This
ignored local artifact uses an owner-only directory and file permissions and is
not served by the fixture. External fonts are unavailable in the offline runner,
so the screenshot uses installed fallback fonts.

Chromium projects explicitly enable Chromium's sandbox. If a restricted runner
denies localhost binding or browser IPC, use the ordinary approval mechanism for
the exact test invocation. Do not disable Chromium's sandbox or change host
AppArmor/sysctl settings. The test runner uses the official Playwright image
for browser libraries and pins Node.js 26 separately. Run it non-root with
Playwright’s documented namespace-enabled
[seccomp profile](https://playwright.dev/docs/docker#crawling-and-scraping).
From the repository root with Docker available:

```bash
nvm use
npm ci
npm run build
docker build -t dome-client-test:node26 test-support/runner
mkdir -p node_modules/.cache
export PLAYWRIGHT_BROWSERS_PATH="$PWD/node_modules/.cache/playwright-browsers"
npx playwright install chromium firefox
curl --fail --silent --show-error \
  https://raw.githubusercontent.com/microsoft/playwright/v1.62.1/utils/docker/seccomp_profile.json \
  -o node_modules/.cache/playwright-seccomp.json
docker run --rm --init --network none --user "$(id -u):$(id -g)" \
  --security-opt "seccomp=$PWD/node_modules/.cache/playwright-seccomp.json" \
  --mount "type=bind,src=$PWD,dst=/work" --workdir /work --shm-size=1g \
  --env SHORTEN_ENABLED=true \
  --env PLAYWRIGHT_BROWSERS_PATH=/work/node_modules/.cache/playwright-browsers \
  --env "GIT_HASH=$(git rev-parse HEAD)" \
  dome-client-test:node26 \
  xvfb-run -a npm run test:browser -- --project=chromium --project=firefox --headed
```

The Dockerfile keeps Node.js 26.12.1 and the browser system libraries separate.
The worktree-local browser download matches the installed Playwright package.
The container retains default AppArmor isolation, uses private shared memory,
publishes no ports and has no external network. Use the same image for coverage
or mutation checks by replacing the final
command with `npm run coverage` or `npm run test:mutation:warm`. The socket tests
expect `SHORTEN_ENABLED=true` for the local shortener fixture.
Browser caches are ignored and all artifacts remain local. These tests do not
verify live MOO permissions, native app WebViews or assistive-technology speech.

## Requirements

- Node.js 26 for development, coverage, browser, and mutation tests. The
  pinned version is in [`.nvmrc`](../.nvmrc).
- npm

## Core Checks

From a clean checkout with Node 26, install the locked dependencies and run the core checks:

```bash
npm ci
npm run lint
npm test
npm run coverage
npm run build
npm run deadcode
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
- 80% branches

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
