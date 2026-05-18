# IDE Editor

The IDE editor is the multi-tab developer editor used by the web client for verb/property editing and code navigation.

It runs in a dedicated popup window at:

- `/editor/ide/`

Core implementation files:

- `src/client/ide.js` (window lifecycle and reuse)
- `src/client/react/EditorIDE.jsx` (IDE UI and behavior)
- `views/editors/ide.ejs` (server-rendered bootstrapping data attrs)

## Window Lifecycle

The client opens the IDE through `dome.openIDE(editor)`.

Behavior:

- Reuses a named popup window (`dome-ide`) when possible.
- If the existing window is already on `/editor/ide/`, sends a `postMessage` tab-open event immediately.
- If not ready yet, stores pending editor/socket state and sends once IDE reports ready.

Handshake messages:

- IDE window sends: `ide-ready`
- Parent sends: `ide-open-tab` with an editor payload

## Tab Model

Each tab includes:

- `editorName` / `title`
- `uploadCommand`
- parsed `command` and `commandTarget`
- `content`, `savedContent`, `dirty`

Tab types include:

- Normal editor tabs
- `Object Browser` tab
- `Property Browser` tab

The IDE tracks recently active tabs and uses that history for fallback focus when closing the active tab.

## Save Flow

Save action (`Ctrl/Cmd+S`) behavior:

1. Send `uploadCommand`
2. Send tab buffer as `content + "\n."`
3. Mark tab clean (`dirty=false`, update `savedContent`)

Only tabs with a real `commandTarget` are saveable.

## Supported Edit Commands

The IDE is command-aware and currently handles:

- `@program` (MOO mode enabled)
- `@set-note-text`
- `@set-note-string`
- `@local-save-node`
- `@local-save-node-admin`
- `@local-save-note`
- `@scratch`

Line limits are enforced for local-save commands (configurable via env; passed through `views/editors/ide.ejs` data attrs).

## Scratch Support

Header actions:

- `Add Scratch` opens a temporary scratch tab (`@scratch ...` command)
- `View Saved Scratch` sends `@edit me.scratch`

MOO-side setup for scratch is documented in `docs/MOO-SETUP.md`.

## Object / Property Browsers

The IDE can open browser tabs for object/property inspection and navigation.

Loading data uses SDWC OOB commands:

- `#$# SDWC%%VERBS%%<objectId>`
- `#$# SDWC%%PROPS%%<objectId>`

Selecting a row opens the edit target:

- Verb: `@edit <obj>:<verb>`
- Property: `@edit <obj>.<property>`

## Ctrl/Cmd-Click Navigation

Inside `@program` tabs, Ctrl/Cmd-clicking a detected `obj:verb` or `obj.prop` reference sends:

- `@edit <target>`

If `IDE_EDIT_OPEN_PARENT=true` and target is a verb (`:` form), IDE appends:

- ` --open-parent`

So emitted command becomes:

- `@edit <obj>:<verb> --open-parent`

## Hover Overlays (SDWC)

In `@program` tabs, hovering detected references triggers SDWC overlay fetches.

Requests:

- Verb: `#$# SDWC%%VERB-OVERLAY%%<obj>%%<verb>`
- Property: `#$# SDWC%%PROP-OVERLAY%%<obj>%%<prop>`

Responses are routed from buffer parsing to IDE via `postMessage`:

- `ide-verb-overlay`
- `ide-prop-overlay`

Overlay results are cached by object/item key to reduce repeat calls.

## VMS Note Flow (Optional)

Controlled by env:

- `IDE_VMS_NOTE_ENABLED` (default: false)

When enabled for `@program` tabs:

- IDE can prompt for/save a VMS note.
- On save, if note text is non-empty, an extra line is sent after the normal `@program` upload payload.

When disabled:

- No VMS UI, no prompt, no extra line emitted.

## User Controls / Preferences

IDE supports:

- Light/dark toggle
- Tab orientation (`top` or `left`), persisted in `localStorage` (`ide-orientation`)
- VIM keybinding toggle
- Word-wrap toggle across all tabs
- Editor font updates via message (`ide-set-font` / `set-editor-font`)
- Shortcuts overlay

## Keyboard Shortcuts

- Save tab: `Ctrl/Cmd+S`
- Close active tab: `Ctrl/Cmd+E`
- VIM on: `Ctrl/Cmd+1`
- VIM off: `Ctrl/Cmd+0`
- Prev tab: `Ctrl/Cmd+[`
- Next tab: `Ctrl/Cmd+]`
- Toggle wrap: `Ctrl+Shift+L`
- Toggle tab orientation: `Ctrl/Cmd+Shift+X`
- Toggle shortcuts overlay: `Ctrl/Cmd+/`
- Reference jump: `Ctrl/Cmd+Click`

## Environment Controls

Relevant env toggles:

- `IDE_EDIT_OPEN_PARENT`
- `IDE_VMS_NOTE_ENABLED`
- `LOCAL_SAVE_NODE_MAX_LINES`
- `LOCAL_SAVE_NODE_ADMIN_MAX_LINES`
- `LOCAL_SAVE_NOTE_MAX_LINES`

## MOO Requirements

The IDE relies on MOO-side command support for edit/save plus SDWC verbs for browser/overlay features.

See:

- `docs/MOO-SETUP.md`
