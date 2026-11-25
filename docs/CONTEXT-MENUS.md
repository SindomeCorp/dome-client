# Output context menus

Right-click a reference in Main, Secondary, or popped-out output. ANSI colors and Find highlights do not split the reference. The shipped Player profile offers Copy for `#123:verb`, `#123.property`, and `#123`, in that specificity order. Selected output has its own Copy and Open in Scratchpad menu without regex matching. A selection takes precedence over an overlapping reference; clear it to use reference commands. Links, media, controls, blank space, unmatched text, unavailable actions and Shift-right-click retain browser menus.

Tab into output and use Up/Down to focus a row, then Shift+F10 or the Menu key. A row with multiple references offers a reference chooser. Arrow keys and Home/End navigate menus; Enter/Space activate, Escape dismisses and restores focus. Selection menus also support Shift+F10. Native Copy remains available using Ctrl/Cmd+C or the browser menu.

## Options and persistence

Options → Context Menus shows the active human label and its source: selected by server, Override or Fallback. A brief polite main-window notice announces changes of effective profile ID without taking focus. Identical server messages, source-only changes and reloads retaining the same profile do not repeat it.

The unchecked-by-default Override server context menu selection checkbox enables a dropdown of every registered profile, including valid local profiles and staff profiles. Override settings and fallback are saved globally for this client origin across connections, not per game. An enabled valid override wins over the server ID; otherwise the latest recognized current-session ID wins, then fallback. With an invalid/missing saved choice, the first registered profile is the final fallback. Unchecking immediately restores the current server choice or fallback. These are convenience menus; the game enforces every command's permissions.

Edit JSON in Options and choose Reload context menus. Import JSON reads and validates a selected file; Export JSON downloads the current valid document. Successful reloads save a browser-local copy for restart. Invalid JSON, schema, regex, capture declarations or templates keep the previous valid snapshot and show a field-specific error. Reloads are transactional, including worker compilation; stale overlapping reload requests cannot overwrite newer ones. The editor draft is not saved until a successful reload. Browser storage failures are reported.

A selected file is an imported copy: select it again to read external edits, including reselecting the same filename. Ordinary pages cannot reread an arbitrary local path. This implementation uses file import and browser-local JSON; retained File System Access handles are not required or implemented. A self-hosted deployment may change `data/context-menus.json` and rebuild/restart its client bundle. That is a client-served default, not browser filesystem access; Options Reload does not fetch that source again or accept a game-supplied URL.

## Configuration

`data/context-menus.json` is the complete minimal example. The version-1 document contains `rules` and `profiles`. IDs are case-sensitive, begin with a letter, and contain letters, digits, `_` or `-` (maximum 64 characters). Unknown fields and duplicate IDs are errors. A profile declares `id`, `label`, a list of rule IDs, and optional `selectionActions`. Labels are literal text, never HTML or code. Any registered ID is selectable locally or by OOB; registration grants no game permission.

A rule declares `id`, integer `priority`, regex `pattern`, optional `flags` (`i`/`u`), typed named `captures`, and `actions`. Regex source is JSON-escaped, without `/` delimiters. Full-match ranges containing the pointer compete by priority, then longest range, then rule order in the profile. Only the winning rule supplies actions. The shipped priorities are verb 300, property 200, object 100. Matching crosses presentation spans and visual wraps, never logical newlines.

For example, add these actions to the shipped object rule:

```json
[
  { "id": "show", "label": "Show object", "type": "game-command", "template": "@show ${object}" },
  { "id": "verbs", "label": "List verbs", "type": "game-command", "template": "@verbs ${object}" }
]
```

New command names require no client code change. `object` includes the `#`. Capture types are `object-id` (`#[0-9]+`), `verb-name` and `property-name` (ASCII letter/underscore followed by letters, digits or underscores). Every declared capture is independently validated as a complete value. The shipped grammar does not cover negative IDs, `$aliases`, quoted names or wildcard verb aliases.

Templates consist only of literal text, `${captureName}`, and `$$` for a literal dollar. Placeholders must name declared typed captures. Expressions, functions, positional replacements and missing captures are rejected. A missing optional capture makes its match ineligible. Templates are parsed at reload; interpolation happens exactly once upon explicit activation, with final length and control-character validation. Commands are single-line, at most 2048 characters, and sent once through the current connection. There is no evaluation, chaining engine, URL action or selection substitution. Literal command syntax is the user's responsibility and remains subject to game permissions.

Client actions use `type: "client-action"`, an allowlisted `action` ID, and `input: "target"` or `"selection"`. The built-in IDs are `clipboard.copy` (either context) and `ide.open-scratch` (selection only). Selection actions cannot be game commands or templates. Configuration cannot supply JavaScript, callbacks, module paths, upload commands or new native handlers.

Regex execution is isolated in a dedicated worker with a watchdog and bounded queues, line sizes and match counts. Matches are prepared for mounted rows. If matching is pending, unavailable, too expensive, or the target is stale, the browser menu remains available; try again once preparation completes. No synchronous arbitrary-regex fallback runs on the UI thread. Reload to retry a failed worker. This isolation is independent of output-routing workers.

The worker compiles each configured rule once per valid configuration revision. Profiles share those compiled rules in their own declared order; switching profiles does not recompile them. Each row resets regex `lastIndex` before matching and after completion, including errors. A successful JSON reload replaces the compiled registry; a failed reload retains the previous registry. Priorities, match limits and worker timeouts are unchanged.

## Server selection and session boundaries

After detecting the webclient and checking the logged-in player's permissions, the game may send exactly one known profile ID:

```text
#$# SDWC%%CONTEXT-PROFILE%%"player"
```

No profile object, regex, template, action list or URL is accepted. Invalid/unknown IDs clear the previous server override and use Options selection. There is no automatic command response to profile selection. Configure additional role profiles in client JSON before sending their IDs.

The server ID is memory-only. Connection replacement, transport disconnect/reconnect and failed reconnect reset it; queued old-connection data cannot reactivate it. For same-connection logout/character changes, the game must send this marker before the next profile selection:

```text
#$# SDWC%%CONTEXT-RESET
```

Resend the appropriate known ID after login or permission changes, including a player profile when leaving a staff role. The client does not guess identity transitions from prose. Native wrappers can call `DomeBridge.onSessionChange` with `connected`, `disconnected`, `logout` or `character-changed`. Existing Clear Buffer resets output parsing but does not discard the current profile. Global override settings survive session resets.

## Scratchpad and clipboard

Selection-prefilled scratch tabs suppress passive reference-hover requests. Their existing explicit Save workflow remains available.

Open in Scratchpad reuses the existing IDE and `@scratch` save workflow, including `IDE_SCRATCH_ENABLED` eligibility. Only selected text is prefilled, with surrounding whitespace preserved. Each invocation creates an independent unsaved editor document. Closing immediately, before any edit, warns; edits/undo remain unsaved until an explicit Save. Opening itself neither saves/uploads nor executes the selection. Save is a separate existing action using existing game permissions. Two tabs do not imply separate persistent scratch records: the game's existing scratch implementation may overwrite the same player scratch property.

Copy writes plain text using the originating document's Clipboard API on explicit activation; permission denial is reported. Native Copy remains the fallback when that API is unavailable. Selection extraction includes retained unmounted history, excludes preview controls and respects the selected output panel. Saved HTML logs do not acquire live game actions.
