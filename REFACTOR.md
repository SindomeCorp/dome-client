# Refactoring Plan

This plan targets the remaining browser-client debt. The goal is to keep reducing change propagation without a rewrite: extract leaf features first, prove the pattern with focused tests, then converge on the central `dome` composition layer.

## Current State

Remaining debt:

- Client modules still coordinate through the mutable global `dome` object.
- Several leaf pages mix DOM lookup, event binding, persistence, validation, rendering, and navigation.
- Option metadata is centralized in JavaScript but still partly duplicated in EJS markup.
- Some feature stores and UI modules mutate shared objects at runtime instead of exposing explicit APIs.

## Phase 1. Extract the Connect Page Leaf

Status: Complete.

Target files:

- `src/client/pages/client-connect.js`
- `src/client/store.js`
- New `src/client/saved-users-store.js`
- New focused tests under `test/client/`

What it accomplishes: Move saved-user persistence and connect intent building out of the DOM event setup file.

Why: `client-connect.js` is self-contained, overloaded, and currently mutates the generic `store` object with login-profile methods. It is the lowest-risk place to establish the next extraction pattern.

Steps:

- Extract saved-user persistence into `saved-users-store.js`.
- Extract pure helpers for building MOO connect commands and player-client URLs.
- Keep DOM event binding in `client-connect.js`, but make it call explicit helpers.
- Add unit tests for saved-user storage, command construction, and host/port URL building.

Benefits:

- The generic storage adapter stays generic.
- Connect behavior becomes testable without a full DOM.
- Future connect-page UI changes stop touching persistence rules.

## Phase 2. Split Client Options UI Binding

Status: Complete.

Target files:

- `src/client/pages/client-options.js`
- `views/partials/client-options-overlay.ejs`
- `src/client/client-option-schema.js`

What it accomplishes: Separate option control binding from import/export, tab behavior, toast rendering, and schema metadata.

Why: Option definitions are centralized, but option control shape and choices still live in EJS and DOM-binding code. Adding an option still requires coordinated edits across multiple representations.

Steps:

- Extract pure import/export payload helpers from `client-options.js`.
- Extract DOM binders such as `bindOptionSelects`, `bindOptionButtons`, `bindOptionInputs`, and `bindImportExportControls`.
- Extend schema metadata enough for EJS to render repeated option controls from data.
- Leave layout grouping in EJS, but stop duplicating individual choice lists where the schema already knows them.

Benefits:

- Adding a new client option becomes mostly schema-driven.
- Import/export can be tested without browser download behavior.
- DOM binding becomes smaller and easier to review.

## Phase 3. Extract Health Classification From Health UI

Status: Complete.

Target files:

- `src/client/y-health.js`
- New `src/client/health-status.js`
- Focused tests under `test/client/`

What it accomplishes: Move status classification, error diagnosis, graph input shaping, and display-message construction out of the UI setup function.

Why: `y-health.js` currently combines polling, diagnosis, animation state, chart setup, and DOM rendering. The domain concepts "network issue", "lag", "fatal", and "ok" should be testable without canvas or DOM animation.

Steps:

- Extract `classifyHealthStatus(health)` and `diagnoseConnectionError(error, lastHealth)`.
- Extract graph-series shaping for CPU, memory, and users.
- Keep animation and DOM writes in `y-health.js`.
- Add tests for status classification and connection-error messages.

Benefits:

- Health semantics can change without touching animation code.
- UI tests can focus on rendering and event behavior.
- The status model becomes clearer for future native or alternate clients.

## Phase 4. Extract Button Workflows

Status: Planned.

Target files:

- `src/client/u-buttons.js`
- Existing log export helpers
- New focused helpers as needed

What it accomplishes: Separate button wiring from workflows such as reconnect, save log, clear buffer, overlays, and image preview.

Why: `u-buttons.js` handles several unrelated workflows in one setup function. Those workflows depend on different parts of `dome`, which keeps the global client object wide.

Steps:

- Extract log-download filename and payload creation into pure helpers.
- Extract clear-buffer confirmation behavior into a small binder.
- Move image preview attach/toggle behavior behind an explicit image-preview helper.
- Keep the exported setup function as a short composition of button binders.

Benefits:

- Log export, image preview, and overlay changes become independent.
- `dome.setupButtons` stops being a catch-all for unrelated UI actions.
- Mobile confirmation behavior becomes easier to test directly.

## Phase 5. Normalize Client Composition

Status: Planned after Phases 1-4.

Target files:

- `src/client/index.js`
- `src/client/z-setup.js`
- Remaining `src/client/*` setup modules

What it accomplishes: Convert remaining `dome.setupX` side-effect modules into explicit setup exports that receive a client context.

Why: The current compatibility layer is useful, but `src/client/index.js` still relies on side-effect imports and many modules still write behavior directly onto `dome`.

Steps:

- Convert one setup module at a time to export `setupFeature({ client, document, window })`.
- Have `z-setup.js` call imported setup functions directly.
- Keep temporary assignments to `dome.setupX` only where tests or legacy callers still need them.
- Remove side-effect imports from `src/client/index.js` once the corresponding setup export is wired.

Benefits:

- Initialization order becomes explicit.
- Tests can instantiate only the feature under test.
- The global `dome` object can shrink gradually instead of through a risky migration.

## Phase 6. Thin the Server Composition Root

Status: Planned after browser-client phases, unless server work becomes urgent.

Target files:

- `src/server.js`
- New app/server factory helpers as needed

What it accomplishes: Split Express app creation, server creation, socket wiring, and runtime start/stop behavior.

Why: `src/server.js` is a legitimate composition root, but it currently owns enough unrelated setup that SSL, middleware, route locals, build behavior, and socket wiring all converge in one file.

Steps:

- Extract `createApp({ config, logger })`.
- Extract `createHttpServers({ app, config })`.
- Extract socket manager binding.
- Keep the executable entry point thin.

Benefits:

- Server tests can exercise app behavior without binding network sockets.
- SSL and socket changes become less likely to affect route/middleware setup.
- Start/stop behavior becomes simpler to reason about.

## Suggested Order

Start with Phase 1. It is the best proof point because it is a leaf page, has obvious persistence boundaries, and does not require changing the central player-client startup path.

Then do Phases 2-4 in the order that matches current feature work. Each phase should leave the existing UI behavior intact and add focused tests around the extracted pure helpers. Only after those leaf modules have explicit APIs should Phase 5 reduce the central `dome` wiring.
