# Test Implementation Updates Plan

Date: 2026-06-01

## Objective

Incrementally improve backend mutation resistance and test confidence based on the 2026-06-01 Stryker report (`reports/mutation/mutation.html`), while minimizing expensive mutation reruns during implementation.

## Baseline

- Mutation score: `42.8%` (`325/759` detected, `434` survived).
- Primary survivor hotspots:
  - `src/controllers/socket.js`: `153` survived.
  - `src/services/multi-mud-metrics.js`: `147` survived.
  - `src/controllers/status.js`: `99` survived.
  - `src/controllers/auth.js`: `26` survived.
  - `src/controllers/save.js`: `9` survived.

## Execution Strategy (Single Mutation Validation)

- Implement all phases first using standard test/lint feedback.
- Do **not** run Stryker after each phase.
- Run Stryker once after all planned test updates are complete.
- Allow only one optional mid-cycle mutation run if we hit uncertainty that cannot be resolved with normal tests.

## Principles

- Prioritize phases by mutation impact and implementation risk.
- Strengthen tests before making production logic changes unless defects are found.
- Keep unit tests deterministic and fast; reserve integration tests for boundary behavior.
- Use `npm run test` and targeted test files as the primary feedback loop during implementation.

## Phase 0: Foundation and Tooling Scope

### Goal

Ensure Stryker will exercise the right test surface when we do the final mutation run.

### Work

1. Review `stryker.conf.json` command test list and map it against all relevant backend test files.
2. Expand the Stryker command test list to include missing high-value backend tests, including:
   - `test/routes/socket.test.js`
   - `test/routes/auth.test.js`
   - `test/services/multi-mud-metrics.test.js`
   - Additional integration tests already present and relevant to mutated files.
3. Keep runtime within acceptable limits by batching or parallel tuning if needed.

### Deliverables

- Updated `stryker.conf.json` test command scope.
- Notes on included/excluded tests and rationale.

### Exit Criteria

- Updated config prepared for final single mutation run.

## Phase 1: `multi-mud-metrics` Unit and Integration Hardening

### Goal

Eliminate the largest logic-gap cluster in `src/services/multi-mud-metrics.js`.

### Focus Areas

- Port normalization boundaries (`23`, `65535`, invalid values).
- Address normalization and rejection behavior.
- Load behavior with missing, empty, malformed, or partially invalid metrics payloads.
- Games map normalization, filtering, and coercion rules.
- Sort semantics in `connectedStats()` (`count desc`, tie-break by `address asc`).
- Test hooks: `resetMetricsForTests()` and `setMetricsPathForTests()` behavior.

### Work

1. Expand `test/services/multi-mud-metrics.test.js` with branch-complete unit tests.
2. Add/extend integration assertions in `test/integration/multi-mud-metrics.integration.js` for persistence and sort behavior.
3. Validate no real filesystem pollution outside isolated test paths.

### Deliverables

- New and updated tests for metrics service edge cases.

### Exit Criteria

- Local test suite remains green.
- All planned assertions for metrics service are implemented.

## Phase 2: `status` Controller Error-Path Completion

### Goal

Increase confidence in status fetching, schema validation, and degradation behavior.

### Focus Areas

- `normalizeStatusServiceUrl` behavior (scheme/path normalization).
- `hasRequiredStatusShape` strictness.
- `healthCheck` response branches:
  - Non-OK HTTP.
  - Non-JSON content type.
  - Invalid JSON body.
  - Invalid schema.
  - Network errors by code.

### Work

1. Add/extend route and controller-level tests around status endpoint behavior.
2. Mock fetch responses with explicit header/body combinations.
3. Assert both payload outputs and fallback message/state behavior.

### Deliverables

- Expanded status tests in `test/routes/status.test.js` and relevant integration coverage.

### Exit Criteria

- Local test suite remains green.
- All planned status branches are asserted.

## Phase 3: `socket` Controller Branch and Event Semantics

### Goal

Address highest-complexity branch surface in socket lifecycle and I/O handling.

### Focus Areas

- Host/port parsing and multi-mud fallback decisions.
- Proxy IP extraction behavior in `userIp()`.
- `logUser()` object-label error path vs string-label info path.
- Marker-triggered user injection (`#$# dome-client-user`).
- Input command handling edge cases (`connect`, `co`, `@quit`, null input).
- Event sequencing and active-state transitions (`end`, `error`, `disconnect`).
- URL-shortening branch behavior with failures and success.

### Work

1. Expand `test/routes/socket.test.js` and existing integration files (`socket-runtime`, `socket-chaos`, `socket-tcp-bridge`) for branch assertions.
2. Add targeted tests for regex/command parsing and emitted status/error behavior.
3. Assert no duplicate disconnect/quit side effects.

### Deliverables

- Expanded socket tests with stronger branch assertions.

### Exit Criteria

- Local test suite remains green.
- All planned socket branch assertions implemented.

## Phase 4: `auth` and `save` Cleanup Phase

### Goal

Close remaining low-volume survivor gaps and enforce response contract assertions.

### Focus Areas

- `auth` guard/shape conditions and destination precedence (`gogogo` vs `return`).
- Session error message fallback behaviors.
- `save.log` header correctness and optional buffer handling.

### Work

1. Extend `test/auth-login.test.js` with tighter negative/precedence assertions.
2. Add route/controller tests for `save.log` response headers and payload handling.

### Deliverables

- Completed test coverage for remaining small survivor sets.

### Exit Criteria

- Local test suite remains green.
- Planned auth/save assertions completed.

## Phase 5: Consolidation and Single Mutation Validation

### Goal

Validate all improvements in one mutation run and lock in workflow.

### Work

1. Run full `npm run lint`.
2. Run full `npm run test`.
3. Run one full Stryker pass.
4. Capture final report and compare with 2026-06-01 baseline.
5. Tune thresholds in `stryker.conf.json` based on final stable result.
6. Document mutation workflow in `README.md` or `docs/` for repeatability.

### Deliverables

- Final mutation comparison summary.
- Updated thresholds.
- Documentation updates.

### Exit Criteria

- Stable CI.
- Mutation score meets agreed target band.

### Target

- Interim global mutation score target: `>=70%`.
- Stretch target after stabilization: `>=80%`.

## Suggested Execution Order

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5

## Tracking Template Per Phase

Use this checklist while executing each phase:

- [ ] Scope confirmed.
- [ ] Tests added/updated.
- [ ] Targeted tests pass.
- [ ] Full test suite passes.
- [ ] Follow-up issues captured.

## Reporting Format During Implementation

Capture progress after each phase in this format:

- Date:
- Phase:
- Files changed:
- Tests added/updated:
- Notable behavior branches covered:
- Regressions or flakes observed:
- Next phase adjustments:

## Final Validation Report Format

After the single Stryker run, capture:

- Date:
- Final mutation score:
- Baseline mutation score (`42.8%`) delta:
- Survivor delta by file:
- Remaining top survivor lines:
- Threshold changes made:
- Follow-up backlog items:

## Major Impact Plan (Post-78.9% Run)

Date: 2026-06-01

### Objective

Push mutation score meaningfully above the current `78.9%` by targeting the highest residual survivor density and timeout clusters before the next long rerun.

### Current Residual Hotspots

- `src/controllers/status.js`: `71.0%` (`56 survived`, `5 timeout`).
- `src/controllers/socket.js`: `78.8%` (`62 survived`, `12 timeout`).
- `src/controllers/auth.js`: `83.2%` (`21 survived`).
- `src/services/multi-mud-metrics.js`: `84.6%` (`23 survived`, `1 timeout`).
- `src/controllers/save.js`: `100%` (done).

### Strategy

- Use one implementation wave with targeted branch-killing tests and minimal production changes.
- Prioritize in order: `status` -> `socket` -> `auth` -> `multi-mud-metrics`.
- Keep verification on targeted test sets + lint only during implementation.
- Run one mutation rerun after all tasks in this plan are completed.

### Workstream A: `status` (Highest ROI Remaining)

Goal: reduce `status.js` survivors/timeouts by hardening timer and degradation branches.

Tasks:
1. Add explicit tests for timer setup branches around `setInterval`/`setTimeout` and `unref` guards:
   - handles with `unref`.
   - handles without `unref`.
2. Add stronger assertions for logger payload construction in:
   - non-OK response branch.
   - non-JSON content-type branch.
   - invalid JSON branch.
   - malformed schema branch.
3. Add refresh-sequence tests verifying `checked` monotonic updates and fallback-state consistency across repeated failures.
4. Add explicit shape matrix tests for all required numeric fields and missing/invalid message/state.

Exit criteria:
- Most remaining survivors at lines around status error handling and timer guards are eliminated.

### Workstream B: `socket` (Largest Absolute Survivor Count)

Goal: reduce `socket.js` survivors/timeouts in connect lifecycle and input/data handling.

Tasks:
1. Add lifecycle timeout-path tests to assert deterministic behavior when:
   - connect never resolves.
   - connect error fires before connect.
   - connect callback and error callback race.
2. Add command parser matrix tests:
   - valid: `connect X p`, `co X p`.
   - invalid: `connect`, `co`, `connect X`, mixed/partial tokens.
   - assert exact `USR` logging emission count.
3. Add event-order assertions:
   - `@quit` path emits expected events once.
   - disconnect path writes quit once even under repeated events.
4. Add data path assertions:
   - marker branch with/without `hostname`.
   - shorten enabled/disabled + active/inactive socket states.
   - verify output/status emission gates.
5. Add logging field assertions for device inclusion/exclusion and proxied IP behavior.

Exit criteria:
- Timeout mutants around connection and input branches are reduced.
- Survivors concentrated in untestable-equivalent logging mutants only.

### Workstream C: `auth` (Guard-Matrix Cleanup)

Goal: reduce logical/conditional survivors in auth payload guards.

Tasks:
1. Build table-driven payload-shape tests for:
   - non-object/array/null payloads.
   - non-string `status`.
   - `status: \"ok\"` with invalid/missing/null/array `user`.
   - non-string `message` when provided.
2. Add destination precedence matrix:
   - default `/`.
   - `gogogo` with/without valid chars.
   - valid local `return` overriding gogogo.
   - invalid `return` ignored.
3. Add request body coercion edge tests for absent fields and ensure safe failure behavior.

Exit criteria:
- Survivors around auth guard predicates and redirects are significantly reduced.

### Workstream D: `multi-mud-metrics` (Fallback/Logger Residuals)

Goal: remove residual survivors in logger fallback and disk error branches.

Tasks:
1. Mock logger variants to force all warning fallback paths:
   - `warn` exists.
   - `warn` absent + `error` exists.
   - both absent (no-op fallback).
2. Add disk-failure tests:
   - `readFileSync` throw path.
   - `writeFileSync` throw path.
   - `renameSync` throw path.
3. Assert behavior remains stable (no crash; metrics state preserved as expected).

Exit criteria:
- Survivors around logger fallback lines are mostly eliminated.

### Execution Sequence

1. Complete Workstream A (`status`).
2. Complete Workstream B (`socket`).
3. Complete Workstream C (`auth`).
4. Complete Workstream D (`multi-mud-metrics`).
5. Run targeted tests and lint after each workstream.
6. Run one full mutation rerun at the end.

### Verification Commands During Implementation

- Targeted tests:
  - `NODE_ENV=test node --experimental-test-module-mocks --import=./test/mock-module.js --test <targeted-files>`
- Lint:
  - `npm run lint`

### Success Targets for Next Mutation Rerun

- Global score target: `>=82%`.
- Strong target: `>=85%` if timeout mutants drop substantially.
- File targets:
  - `status.js` >= `78%`.
  - `socket.js` >= `82%`.
  - `auth.js` >= `88%`.
  - `multi-mud-metrics.js` >= `88%`.

## Implementation Progress

- Date: 2026-06-01
- Phase: 0-4 (first implementation batch)
- Files changed:
  - `stryker.conf.json`
  - `test/services/multi-mud-metrics.test.js`
  - `test/routes/status.test.js`
  - `test/routes/socket.test.js`
  - `test/auth-login.test.js`
  - `test/routes/save.test.js` (new)
- Tests added/updated:
  - Expanded metrics normalization, boundary, sorting, and reset-hook tests.
  - Added status tests for disabled mode, URL normalization, and response/error degradations.
  - Added socket tests for invalid multi-mud port fallback, IPv6-mapped address normalization, marker fallback path, and `co` command parsing.
  - Added auth tests for unsafe `return` handling and fallback error branches.
  - Added dedicated save controller unit tests for headers and missing buffer handling.
- Notable behavior branches covered:
  - `multi-mud-metrics` input validation and persisted-load normalization.
  - `status` non-OK/non-JSON/invalid-JSON and disabled-mode behavior.
  - `socket` marker handling and fallback host/port path for invalid query ports.
  - `auth` destination precedence and non-ok/null user payload paths.
  - `save` response contract and optional chaining path.
- Verification run:
  - `NODE_ENV=test node --experimental-test-module-mocks --import=./test/mock-module.js --test test/services/multi-mud-metrics.test.js test/routes/status.test.js test/routes/save.test.js test/auth-login.test.js test/routes/socket.test.js`
  - `npx eslint test/services/multi-mud-metrics.test.js test/routes/status.test.js test/routes/save.test.js test/auth-login.test.js test/routes/socket.test.js`

- Date: 2026-06-01
- Phase: 1-4 (second implementation batch)
- Files changed:
  - `test/services/multi-mud-metrics.test.js`
  - `test/routes/status.test.js`
  - `test/routes/socket.test.js`
- Tests added/updated:
  - Added metrics-load coercion case for string count and non-object `games` container.
  - Added status schema rejection for non-string `state`.
  - Added status URL behavior assertion preserving explicit path/query.
  - Added socket branch assertion that inactive sockets do not emit `data`.
  - Added negative command-parse assertion for incomplete `connect` input.
- Notable behavior branches covered:
  - `status` shape validation branch (`state` type) and URL-path preservation path.
  - `socket` runtime gating when `socket.isActive` is false in the non-marker data path.
  - `multi-mud-metrics` parsed payload coercion and fallback on invalid container types.
- Verification run:
  - `NODE_ENV=test node --experimental-test-module-mocks --import=./test/mock-module.js --test test/services/multi-mud-metrics.test.js test/routes/status.test.js test/routes/save.test.js test/auth-login.test.js test/routes/socket.test.js`
  - `npx eslint test/services/multi-mud-metrics.test.js test/routes/status.test.js test/routes/save.test.js test/auth-login.test.js test/routes/socket.test.js`
