# Technical Debt Plan: Editor IDE

This plan addresses the remaining debt in `src/client/react/EditorIDE.jsx`
without changing user-facing IDE behavior. The IDE has already moved many pure
helpers, side effects, state transitions, and UI pieces into focused modules.
The next work should reduce the remaining orchestration pressure in
`EditorIDE.jsx` while preserving the current UI, shortcuts, socket commands, tab
ordering, save behavior, hover overlays, VMS note flow, and browser panels.

Implementation status: completed. The phases below describe the completed
extractions and the behavior each phase protects.

## Refactor Principles

- Preserve behavior first. Each phase should be covered by characterization tests
  before code is moved.
- Keep UI output stable. Refactors should not intentionally change layout,
  styling, labels, keyboard shortcuts, tab behavior, or wire protocol strings.
- Extract behavior by responsibility, not by file size alone.
- Prefer modern React patterns: focused custom hooks for stateful behavior,
  small pure helpers for planning/parsing/formatting, and memoized derived values
  only where they remove real noise.
- Isolate side effects behind narrow adapters for Ace, socket IO, browser
  globals, and storage.
- Make invalid states harder to represent by replacing ad hoc raw string handling
  with named parser, classifier, formatter, and planner functions.
- Keep every phase independently shippable and reversible.

## Current Debt Summary

| Risk | Priority | Classification | Current Signal |
|------|----------|----------------|----------------|
| Cognitive Overload | Scheduled | Accidental | `EditorIDE.jsx` still coordinates preferences, Ace wiring, messages, tab lifecycle, save flow, VMS prompt state, overlays, shortcuts, and rendering. |
| Change Propagation | Scheduled | Accidental | Tab opening still mixes command parsing, browser graph side effects, duplicate policy, ID creation, and editable tab construction. |
| Accidental Complexity | Monitored | Accidental | Keyboard shortcut policy lives in a large DOM event effect with modal, tab, editor, and layout behavior interleaved. |
| Knowledge Duplication | Monitored | Accidental | Verb and property overlay payload handlers repeat the same cache and overlay-update algorithm. |

## Completed Baseline

These earlier plan goals are already in place and should be preserved:

- Characterization coverage exists for command parsing, tab ordering, duplicate
  tabs, save ordering, VMS note prompting, keyboard shortcuts, and hover overlay
  cache behavior.
- Pure helper modules exist for targets, protocol formatting, payload
  normalization, tab construction, and reducer state transitions.
- Side-effect modules exist for IDE config, persisted preferences, window
  messages, Ace editor lifecycle, and socket input emission.
- Focused UI components exist for the toolbar, tab strip, editor panes, browser
  panes, shortcut dialog, hover overlay, and VMS prompt dialog.
- Reducer tests cover the central IDE state machine.

## Phase 1: Extract Tab Open Planning

Status: completed.

Highest impact: this attacks change propagation in the most feature-sensitive
remaining function.

### Scope

- Move editor command classification out of `EditorIDE.jsx`.
- Separate tab-open planning from dispatching React state updates.
- Keep browser side effects explicit and testable.
- Preserve duplicate-tab behavior and duplicate warning message text exactly.

### Target Module

- `src/client/react/editor-ide/openTabPlan.js`

### Move Or Create

- `classifyEditorCommand(editor)`:
  - parses `uploadCommand`
  - detects program, verb-edit, and property-edit contexts
  - returns command, command target, title, duplicate key, and browser context
- `buildOpenTabPlan(editor, documents, idFactory)`:
  - returns either a duplicate activation plan or an editable-tab open plan
  - includes browser graph effects such as `upsertObjectVerb` and
    `upsertObjectProperty`
  - delegates editable tab construction to existing tab helpers
- `createEditorTabId()`:
  - wraps current ID behavior so tests can inject deterministic IDs

### Design Notes

- Keep the planner pure except for the injectable ID factory.
- Do not move `dispatchIde` or `emitInput` into the planner.
- Return named effects instead of executing them directly.
- Keep `EditorIDE.jsx` responsible only for applying a plan.

### Tests To Add

- Program tabs pin object browser and upsert the edited verb.
- `@edit #1:verb` tabs upsert the edited verb.
- `@edit #1.prop`, `@set-note-string`, and `@set-note-text` tabs pin property
  browser and upsert the edited property.
- Duplicate tabs activate the existing document and do not replace content.
- Scratch tabs remain editable tabs and do not pin either browser panel.

### Exit Criteria

- `addTab` in `EditorIDE.jsx` is a short adapter around `buildOpenTabPlan`.
- Existing tab ordering, duplicate handling, and browser pinning tests pass.
- New pure helper tests cover command classification and plan output.

## Phase 2: Extract Save And VMS Note Flow

Status: completed.

Highest impact: this reduces cognitive load around the most user-visible command
path while keeping socket output stable.

### Scope

- Move save decision logic into a focused hook or pure helper plus hook.
- Keep VMS prompt state transitions separate from protocol message formatting.
- Preserve save ordering:
  - upload command
  - editor content terminated by `\n.`
  - optional VMS note line

### Target Module

- `src/client/react/editor-ide/useIdeSaveFlow.js`

### Move Or Create

- `shouldPromptForVmsNote(tab, ideVmsNoteEnabled)`.
- `saveTab({ tab, getEditorValue, emitInput, dispatchIde, vmsNoteLine })`.
- `useIdeSaveFlow(...)` exposing:
  - `onSave`
  - `cancelVmsPrompt`
  - `submitVmsPrompt`
  - `vmsPrompt`
  - `setVmsPromptValue`
  - `vmsPromptInputRef`

### Design Notes

- Keep `getSaveMessages` as the protocol source of truth.
- Keep the prompt component unchanged.
- Keep invalid save attempts silent, matching current behavior.
- Avoid passing all IDE state into the hook; pass only `tabs`, `active`,
  `ideVmsNoteEnabled`, `getEditorValue`, and `dispatchIde`.

### Tests To Add

- Save does nothing when no active editable tab exists.
- Save prompts when VMS notes are enabled and a program tab has an empty note.
- Submit sends command, content, and note in the existing order.
- Cancel clears the prompt without emitting socket input.
- A failed emit leaves the document dirty.

### Exit Criteria

- `EditorIDE.jsx` no longer contains `runSave`, `submitVmsPrompt`, or VMS prompt
  branching logic.
- Existing save and VMS note behavior tests pass.
- Hook/helper tests cover edge cases without rendering the full IDE.

## Phase 3: Extract Keyboard Shortcut Policy

Status: completed.

Highest impact: this makes shortcut additions safer and keeps modal behavior
from coupling to tab navigation.

### Scope

- Move the `keydown` effect into a focused hook.
- Represent shortcuts as named command handlers rather than an expanding
  conditional chain.
- Preserve platform behavior for `Ctrl+/` and `Meta+/`.

### Target Module

- `src/client/react/editor-ide/useIdeKeyboardShortcuts.js`

### Move Or Create

- `getShortcutCommand(event, platform)` for pure command selection.
- `getAdjacentTabId(tabs, active, direction)` for tab navigation.
- `useIdeKeyboardShortcuts(...)` for DOM listener setup and cleanup.

### Design Notes

- Keep modal-first handling: VMS prompt Escape/Enter still wins over global
  shortcuts.
- Keep shortcut dialog Escape handling before command shortcuts.
- Keep listener cleanup inside the hook.
- Keep the command table small and explicit; do not introduce a shortcut
  framework.

### Tests To Add

- VMS prompt Escape cancels and Enter submits before other shortcuts.
- Shortcut dialog Escape closes the dialog.
- Save, close, VIM mode, word wrap, orientation, and tab navigation invoke the
  same actions as today.
- Non-modified keys do not trigger editor commands.

### Exit Criteria

- `EditorIDE.jsx` no longer contains the `keydown` effect body.
- Shortcut behavior tests still pass.
- New pure tests cover shortcut command selection.

## Phase 4: Unify Overlay Payload Handling

Status: completed.

Highest impact: this removes small but obvious duplication before it drifts.

### Scope

- Replace separate verb and property overlay payload handlers with one shared
  implementation.
- Preserve cache keys, loading-state updates, and payload fallback behavior.

### Target Module

- `src/client/react/editor-ide/overlays.js`

### Move Or Create

- `buildOverlayPayloadUpdate({ kind, data })`.
- `applyOverlayPayload({ overlayCache, setHoverOverlay, update })`.
- Thin local handlers for `ide-verb-overlay` and `ide-prop-overlay`, or a shared
  factory such as `createOverlayPayloadHandler`.

### Design Notes

- Keep overlay cache shape `{ verb: Map, prop: Map }` unless a later phase has a
  stronger reason to change it.
- Keep malformed overlay payloads ignored safely.
- Keep `useAceEditors` overlay request behavior unchanged.

### Tests To Add

- Verb overlay payload updates every computed cache key and clears matching
  loading state.
- Property overlay payload follows the same behavior.
- Payloads without object ID or item name are ignored.
- Non-matching active overlays are not replaced.

### Exit Criteria

- `EditorIDE.jsx` does not duplicate verb/property overlay update logic.
- Overlay cache behavior tests pass.
- New helper tests cover malformed payloads.

## Phase 5: Collapse Remaining Orchestration Noise

Status: completed.

Highest impact after the focused extractions: this leaves `EditorIDE.jsx` as a
composition root instead of a behavior warehouse.

### Scope

- Group object/property browser commands into a focused hook.
- Group active-tab fallback and recent-tab tracking into a focused hook.
- Move derived UI labels into a pure helper.
- Keep rendering structure and props stable unless tests prove a change is
  behavior-neutral.

### Target Modules

- `src/client/react/editor-ide/useIdeBrowserCommands.js`
- `src/client/react/editor-ide/useRecentTabs.js`
- `src/client/react/editor-ide/editorLabels.js`

### Move Or Create

- `useIdeBrowserCommands(dispatchIde)` exposing:
  - `onLoadVerbs`
  - `onLoadProps`
  - `onEditVerb`
  - `onEditProperty`
  - `toggleObjectCollapsed`
  - `togglePropertyCollapsed`
- `useRecentTabs({ active, tabs, dispatchIde })` handling:
  - active history updates
  - fallback activation when the active tab disappears
  - next active tab selection for close behavior
- `buildEditingLabel({ activeTab, vimMode })`.

### Design Notes

- Keep close confirmation in the component or an explicit close-flow hook.
- Do not hide reducer dispatches behind vague generic setters.
- Keep hook APIs command-oriented and small.

### Tests To Add

- Closing active tabs chooses the most recent still-open tab.
- Closing the last tab still attempts to close the window.
- Browser load/edit commands emit the same protocol strings.
- Editing label stays identical for browser and editable tabs.

### Exit Criteria

- `EditorIDE.jsx` is primarily:
  - config and hook composition
  - adapter callbacks
  - derived render props
  - JSX layout
- The component is materially shorter without reducing test coverage.
- `npm run lint` and `npm run test` pass.

## Stability Checklist For Every Phase

- Run `npm run test`.
- Run `npm run lint` before commit.
- Avoid editing generated CSS directly.
- Avoid changing `public/js/ide-editor-window.js` by hand; regenerate through the
  project build when needed.
- Compare before/after behavior for:
  - opening editor tabs
  - duplicate tab handling
  - object and property browser pinning
  - save sequence
  - VMS note prompt
  - keyboard shortcuts
  - hover overlay request and cache behavior
  - tab close fallback
  - dark mode, word wrap, and tab orientation persistence

## Suggested Milestones

### Milestone 1: Tab Planning Boundary

- Complete Phase 1.
- `EditorIDE.jsx` applies tab-open plans instead of owning command
  classification.

### Milestone 2: Save Flow Boundary

- Complete Phase 2.
- VMS prompt and save behavior are covered outside the full IDE render path.

### Milestone 3: Shortcut Boundary

- Complete Phase 3.
- Shortcut policy is testable without mounting Ace editors.

### Milestone 4: Overlay Cleanup

- Complete Phase 4.
- Verb and property overlay payloads share one implementation.

### Milestone 5: Composition Root

- Complete Phase 5.
- `EditorIDE.jsx` is a small composition component with focused hooks doing the
  remaining stateful work.

## Non-Goals

- No intentional UI redesign.
- No shortcut changes.
- No changes to SDWC wire protocol.
- No changes to save ordering.
- No changes to tab ordering.
- No Ace theme, mode, option, or keyboard behavior changes.
- No broad rewrite to a new state management library unless later evidence shows
  React hooks and reducers are insufficient.
- No migration away from the existing reducer unless a specific state transition
  cannot be represented cleanly.

## Recommended First Pull Request

Completed: all phases were implemented together with focused helper and hook
tests, while preserving the existing full IDE behavior tests.
