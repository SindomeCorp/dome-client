# Output context menus

For a hands-on import workflow, a complete example and an authoring reference, see [Creating and using context-menu JSON files](CONTEXT-MENU-JSON.md).

Right-click a reference in Main, Secondary, or popped-out output. ANSI colors and Find highlights do not split the reference. The shipped Player profile offers Copy for `#123:verb`, `#123.property`, and `#123`, in that specificity order. Selected output has its own Copy and Open in Scratchpad menu without regex matching. A selection takes precedence over an overlapping reference; clear it to use reference commands. Links, media, controls, blank space, unmatched text, unavailable actions and Shift-right-click retain browser menus.

Tab into output and use Up/Down to focus a row, then Shift+F10 or the Menu key. A row with multiple references offers a reference chooser. Arrow keys and Home/End navigate menus; Enter/Space activate, Escape dismisses and restores focus. Selection menus also support Shift+F10. Native Copy remains available using Ctrl/Cmd+C or the browser menu.

## Options and persistence

Basic also offers **Underline right-clickable text**, unchecked by default and saved globally for this client origin. It uses the active profile's already prepared regex matches and available actions, including matches split across ANSI/Find spans. Underlines update when the profile, configuration or mounted output changes; links and other native-menu targets are not marked. They are paint-only CSS highlights, not selectable wrappers, and do not alter text, selection, Copy, Scratchpad or command activation. Browsers without CSS Custom Highlight support show this setting as unavailable; context menus still work normally.

Options → Context Menus shows the active human label and its source: selected by server, Override or Fallback. A brief polite main-window notice announces changes of effective profile ID without taking focus. Identical server messages, source-only changes and reloads retaining the same profile do not repeat it.

The Basic tab is selected by default and contains the unchecked-by-default Override server context menu selection checkbox and a dropdown of every registered profile, including valid local profiles and staff profiles. The bold active-profile label and source remain visible in both Basic and Advanced. Override settings are saved globally for this client origin across connections, not per game. An enabled valid override wins over the server ID; otherwise the latest recognized current-session ID wins, then automatic fallback to `player`, or the first registered profile if Player is absent. There is no configurable fallback dropdown; older saved fallback preferences are ignored. With no registered profiles, custom menus are disabled and ordinary browser menus remain available. Unchecking immediately restores the current server choice or automatic fallback. These are convenience menus; the game enforces every command's permissions.

The Advanced tab contains the JSON editor, help, file import, Reload context menus, Export JSON and validation errors. Import JSON reads and validates a selected file; Export JSON downloads the current valid document. Successful reloads save a browser-local copy for restart. Invalid JSON, schema, regex, capture declarations or templates keep the previous valid snapshot and show a field-specific error. Reloads are transactional, including worker compilation; stale overlapping reload requests cannot overwrite newer ones. The editor draft is not saved until a successful reload. Browser storage failures are reported. A configuration may have zero profiles; if the merged registry is empty, the feature is disabled until valid profiles are loaded.

A selected file is an imported copy: select it again to read external edits, including reselecting the same filename. Ordinary pages cannot reread an arbitrary local path. This implementation uses file import and browser-local JSON; retained File System Access handles are not required or implemented. Self-hosted deployments may edit the client-served files in `data/profiles/`. Options Reload refetches those registered files and applies the editable browser-local JSON as an overlay. Export exports that local overlay, not a cached copy of every shipped role file. The bundled Player document remains the offline safety fallback; rebuild to update that bundled copy.

`src/shared/context-menu-profiles.js` owns the exact registry: `player` → `/profiles/player.json`, `gm` → `/profiles/gm.json`, and `programmer` → `/profiles/programmer.json`. These URLs are served from `data/profiles/` by the client application, not by a MOO server. Game text can select an ID, never a filename, path, URL or document. File responses have a size limit, timeout and schema validation and must define exactly their registered ID. Initial load retains valid role files and reports unavailable files while keeping Player usable. Later failed reloads retain the entire last valid snapshot. Built-in server selections recheck their corresponding file; missing or invalid files use Options fallback. Unchanged file contents reuse the compiled snapshot when profiles switch; changed contents replace it transactionally. Session/reset and overlapping-request guards prevent late responses from restoring an old server choice or overwriting a newer configuration. Valid custom IDs in local JSON remain client-registered without a server-supplied path.

## Configuration

`data/profiles/player.json` is the minimal copy-only example; `gm.json` and `programmer.json` each contain a separate role profile. The version-1 document contains `rules` and `profiles`. IDs are case-sensitive, begin with a letter, and contain letters, digits, `_` or `-` (maximum 64 characters). Lowercase IDs such as `support-gm` and `support_gm` are distinct and are never normalized into each other or into file paths. Unknown fields and duplicate IDs are errors. A profile declares `id`, `label`, a list of rule IDs, and optional `selectionActions`. Labels are literal text, never HTML or code. Registration grants no game permission.

Copy to Clipboard is first in every shipped reference menu. Programmer object commands then follow as `@show`, Name and Number, `@verbs`, `@props`, `@parents`, `@kids`, `@siblings`, `@tree`, Look. Name and Number remains the second game command (third menu item after Copy) and uses the fixed JSON template `;$$string_utils:nn(${object})` to send exactly `;$string_utils:nn(#123)` or `;$string_utils:nn($object)`; its argument accepts only a numeric object or a simple system-object property reference, not calls or expressions. Programmer kids adds `-lcd`. Programmer verb commands after Copy are `@edit`, `@show`, `@args`, `help`; property commands after Copy are `@edit`, `@show`. These Programmer menus support both `#123` and `$object` with the same `:verb` and `.property` delimiters. GM object commands after Copy are `@parents`, `@kids` (no flag), `@notes`, Look. Look sends `look` followed by the validated reference. Other GM and all Player reference menus remain numeric and copy-only. Every reference Copy copies only the matched plain text; selection Copy and Scratchpad remain separate, higher-priority actions, with Copy first.

Programmer also recognizes a safe subset of LambdaMOO traceback frames: `#123:inspect, line 42:  Type mismatch` and `... called from #456:dispatch (this == #789), line 7` (the `this` clause is optional). These synthetic examples follow the server's [print_error_backtrace source](https://github.com/wrog/lambdamoo/blob/master/execute.c#L134-L165), not a live transcript; shared fixtures are in `test-support/fixtures/context-menu-frames.json`. The whole logical line wins at priority 400 over embedded verb references and offers Copy Frame only, including the call prefix, optional receiver and error text. Frame targets are numeric, verb names use the narrow identifier grammar, and line numbers are 1–999999999. Built-in function frames, wildcard/quoted verb names, negative target IDs and custom database traceback formats are not claimed as supported. Unsupported lines may still offer ordinary reference menus; selections always win.

Open at Line is deliberately not offered yet: `src/client/features/editor/react/editor-ide/protocol.js` opens a reference using `@edit` without a line argument; `tabs.js` has no initial-line field, and `useIdeMessages.js` only opens editor payloads. Ace line navigation in `useAceEditors.js` is internal to parser diagnostics, not an external, correlated frame-opening API. Safe navigation needs separate request/response correlation and initial/existing-tab line reveal; pretending `@edit` supports a line suffix or opening an empty saveable editor would be unsafe. No navigation or upload command is sent by Copy Frame.

A rule declares `id`, integer `priority`, regex `pattern`, optional `flags` (`i`/`u`), typed named `captures`, and `actions`. Regex source is JSON-escaped, without `/` delimiters. Full-match ranges containing the pointer compete by priority, then longest range, then rule order in the profile. Only the winning rule supplies actions. The shipped priorities are verb 300, property 200, object 100. Matching crosses presentation spans and visual wraps, never logical newlines.

For example, add these actions to the shipped object rule:

```json
[
  { "id": "show", "label": "Show object", "type": "game-command", "template": "@show ${object}" },
  { "id": "verbs", "label": "List verbs", "type": "game-command", "template": "@verbs ${object}" }
]
```

New command names require no client code change. `object` includes its `#` or `$` prefix. Capture types are `object-id` (`#[0-9]+`), `object-reference` (numeric IDs or `$` plus an ASCII identifier), `line-number` (1–999999999), `verb-name` and `property-name` (ASCII letter/underscore followed by letters, digits or underscores). Symbolic identifiers match the installed `tree-sitter-moo/grammar.js` system-object grammar; the [MOO manual](https://lambda.moo.mud.org/pub/MOO/ProgrammersManual.html) describes them as system-object property shorthand. Every declared capture is independently validated as a complete value. The shipped grammar does not cover negative IDs, arbitrary expressions, quoted names or wildcard verb aliases. The helper's fixed read-only intent does not establish the deployed game's implementation or authorization, which fixture tests cannot verify.

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

Switching context profiles keeps prepared selection text available instead of falling through to the browser menu on the next right-click. The actions still come from the currently active profile. Selection preparation is invalidated by session, history, routing or selection changes, not by profile identity alone; a genuine selection continues to take precedence over reference commands.

Open in Scratchpad reuses the existing IDE and `@scratch` save workflow, including `IDE_SCRATCH_ENABLED` eligibility. Only selected text is prefilled, with surrounding whitespace preserved. Each invocation creates an independent unsaved editor document. Closing immediately, before any edit, warns; edits/undo remain unsaved until an explicit Save. Opening itself neither saves/uploads nor executes the selection. Save is a separate existing action using existing game permissions. Two tabs do not imply separate persistent scratch records: the game's existing scratch implementation may overwrite the same player scratch property.

Copy writes plain text using the originating document's Clipboard API on explicit activation; permission denial is reported. Native Copy remains the fallback when that API is unavailable. Selection extraction includes retained unmounted history, excludes preview controls and respects the selected output panel. Saved HTML logs do not acquire live game actions.
