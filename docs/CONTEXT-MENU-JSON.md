# Creating and using context-menu JSON files

Hosting option: `CONTEXT_MENUS_ENABLED=true` (default) enables this feature. Set it to `false` to hide its Options tab and retain native browser menus. Startup validates the client-registered JSON files; if none is usable, context menus automatically disable and the server logs an error with profile details. Restore at least one valid file with actions and restart the client server. Local imports and overrides cannot bypass this switch. A failed in-session reload still keeps the last valid snapshot. The shipped profiles target MOOs; custom JSON matchers and commands can support other games.

This guide explains how to import a context-menu file, create your own profile and add commands without changing client code. For the complete feature overview, see [Output context menus](CONTEXT-MENUS.md).

Configuration belongs to the client, not the game server. Labels, regex rules and command templates are validated client-side. Context-menu game commands are sent only when you explicitly choose one from a menu, and normal game authorization still applies.

## 1. Start with a working file

The shipped examples are:

| File | What it provides |
| --- | --- |
| [`data/profiles/player.json`](../data/profiles/player.json) | Selected-text Copy only; no reference matching or underlines. |
| [`data/profiles/gm.json`](../data/profiles/gm.json) | Numeric object commands; verb/property references remain copy-only. |
| [`data/profiles/programmer.json`](../data/profiles/programmer.json) | Numeric and symbolic object/verb/property commands, plus Copy Frame for supported traceback frames. |

For a personal profile, use a new profile ID and prefix your rule IDs to avoid accidentally replacing shipped rules. The complete example below creates **My Tools** with ID `my-tools`.

## 2. Import or edit your configuration

1. Open **Options → Context Menus → Advanced**.
2. Use **Export JSON** to back up your current local document before replacing it.
3. Either paste a complete document into **Context menu JSON** and click **Reload context menus**, or select a `.json` file using **Import JSON**. Import automatically validates and loads the selected file.
4. If validation fails, read the error in Advanced. The previous valid configuration remains active; the invalid draft is not saved.
5. Switch to **Basic**, check **Override server context menu selection**, and select your new profile from **Override profile**.
6. Check the bold active-profile label. For this example it should say **Active Profile: My Tools (Override)**.

A successful reload saves a browser-local copy for future connections on this client origin. Storage errors are reported; if storage is blocked, changes may be session-only. External file edits are not watched: import the file again, or paste the changes and reload. An ordinary browser page cannot reread an arbitrary path on your computer. Export downloads the current valid **local document**, not all the shipped profile files.

Basic also has **Underline right-clickable text**, off by default. In supported browsers it marks the active profile's prepared regex matches that have available menu actions. This is a display preference, not a field in the profile JSON.

## 3. Complete personal-profile example

Save this as `my-context-menus.json`, or paste it into the Advanced editor. It supports `#123` and `$player`, with corresponding `:look` and `.name` references. Copy is first; the remaining action order is exactly the order written in each `actions` array.

```json
{
  "version": 1,
  "rules": [
    {
      "id": "my-tools-verb",
      "priority": 300,
      "pattern": "(?<![A-Za-z0-9_#$])(?<object>#[0-9]+|\\$[A-Za-z_][A-Za-z0-9_]*):(?<verb>[A-Za-z_][A-Za-z0-9_]*)(?![A-Za-z0-9_])",
      "captures": { "object": "object-reference", "verb": "verb-name" },
      "actions": [
        { "id": "copy", "label": "Copy to Clipboard", "type": "client-action", "action": "clipboard.copy", "input": "target" },
        { "id": "show", "label": "Show verb", "type": "game-command", "template": "@show ${object}:${verb}" }
      ]
    },
    {
      "id": "my-tools-property",
      "priority": 200,
      "pattern": "(?<![A-Za-z0-9_#$])(?<object>#[0-9]+|\\$[A-Za-z_][A-Za-z0-9_]*)\\.(?<property>[A-Za-z_][A-Za-z0-9_]*)(?![A-Za-z0-9_])",
      "captures": { "object": "object-reference", "property": "property-name" },
      "actions": [
        { "id": "copy", "label": "Copy to Clipboard", "type": "client-action", "action": "clipboard.copy", "input": "target" },
        { "id": "show", "label": "Show property", "type": "game-command", "template": "@show ${object}.${property}" }
      ]
    },
    {
      "id": "my-tools-object",
      "priority": 100,
      "pattern": "(?<![A-Za-z0-9_#$])(?<object>#[0-9]+|\\$[A-Za-z_][A-Za-z0-9_]*)(?![A-Za-z0-9_])",
      "captures": { "object": "object-reference" },
      "actions": [
        { "id": "copy", "label": "Copy to Clipboard", "type": "client-action", "action": "clipboard.copy", "input": "target" },
        { "id": "show", "label": "Show object", "type": "game-command", "template": "@show ${object}" },
        { "id": "verbs", "label": "List verbs", "type": "game-command", "template": "@verbs ${object}" },
        { "id": "look", "label": "Look", "type": "game-command", "template": "look ${object}" }
      ]
    }
  ],
  "profiles": [
    {
      "id": "my-tools",
      "label": "My Tools",
      "rules": ["my-tools-verb", "my-tools-property", "my-tools-object"],
      "selectionActions": [
        { "id": "copy", "label": "Copy selected text", "type": "client-action", "action": "clipboard.copy", "input": "selection" },
        { "id": "scratch", "label": "Open in Scratchpad", "type": "client-action", "action": "ide.open-scratch", "input": "selection" }
      ]
    }
  ]
}
```

Try it on synthetic or local-fixture output first. Clear any text selection before testing reference menus: a genuine selection has its own menu and takes priority over regex references.

| Text under the pointer | Menu | Example command after explicit selection |
| --- | --- | --- |
| `#123` | Copy, Show object, List verbs, Look | `@verbs #123` |
| `$player` | Same object menu | `@verbs $player` |
| `#123:look` | Copy, Show verb | `@show #123:look` |
| `$player:look` | Same verb menu | `@show $player:look` |
| `#123.name` | Copy, Show property | `@show #123.name` |
| `$player.name` | Same property menu | `@show $player.name` |

The example does not resolve object IDs, symbolic names or game permissions. A syntactically valid reference can still be rejected by the game.

## 4. Understand the document structure

Use strict JSON: double-quoted strings, no comments and no trailing commas.

- `version` must be `1`.
- `rules` contains the matchers and their actions.
- `profiles` contains named menus. A profile's `rules` array selects rule IDs from the same document. Include every referenced rule in the file; do not rely on a rule being present only in a different shipped file.
- A profile's optional `selectionActions` defines its selected-text menu, without regex matching.

Profile, rule and action IDs start with an ASCII letter and may then contain letters, digits, hyphens or underscores, up to 64 characters. IDs are case-sensitive. `support-gm` and `support_gm` are different IDs. Profile and rule IDs must be unique within their respective document arrays; action IDs must be unique within their action array. Human labels are literal text, not HTML, and may be 1–120 characters without control characters.

Importing replaces the previous local document. During loading, registered client-served documents are merged first, then the local document overrides rules and profiles with the same IDs. Replacement is by the **whole rule or profile object**, not by individual fields or by appending actions. Changing a rule used by several profiles affects all those profiles.

To customize a shipped profile intentionally, copy its complete file, keep its profile ID, edit it and import it. To add independent personal tools, use new profile and rule IDs as in the example.

## 5. Write regex matchers and choose precedence

A rule requires `id`, `priority`, `pattern`, `captures` and `actions`; `flags` is optional.

- `pattern` is a JavaScript regex source string, without surrounding `/` delimiters. JSON backslashes must be escaped: write `\\.` for a literal dot and `\\$` for a literal dollar sign.
- Use named groups such as `(?<object>...)`. Declare a supported type for each capture you want to interpolate. Every declared capture must exist in the pattern and validate completely. An absent optional declared capture makes that match ineligible.
- Supported flag strings are `""`, `"i"`, `"u"`, `"iu"` and `"ui"`; omitted or empty flags use `u`. The client adds global matching internally. Do not add `g`, `m`, `s` or `y`.
- Higher integer priority wins at the pointer. Ties prefer the longest complete match, then the rule order in the profile. The example uses verb 300, property 200, object 100 so the more specific menu wins over its embedded object match.
- Matching spans ANSI colors, Find marks and visual wraps, but not logical output newlines. Copy with `input: "target"` copies the **whole matched text**, so keep unwanted surrounding prose out of the match.

The example uses lookbehind/lookahead boundaries to avoid matching references inside larger identifiers. Do not use a pattern that can match an empty string. Regex evaluation runs in a worker with a watchdog; overly expensive rules can make menus unavailable until the configuration is fixed and reloaded.

### Supported capture types

| Type | Accepted complete value |
| --- | --- |
| `object-id` | `#` followed by one or more digits, such as `#123`. |
| `object-reference` | A numeric object ID or `$` followed by an ASCII identifier, such as `$player` or `$_tools2`. |
| `verb-name` | ASCII letter/underscore, then letters, digits or underscores. |
| `property-name` | Same identifier grammar as `verb-name`. |
| `line-number` | Decimal integer from 1 through 999999999, without leading zeroes. |

Each capture is limited to 128 characters and cannot contain control characters. These are narrow syntax types: they do not accept arbitrary expressions, calls, negative object IDs, quoted names or wildcard verb aliases. Adding another capture type requires client development; adding another label, regex rule or supported single-command template does not.

## 6. Add game commands safely

A game-command action has `id`, `label`, `type: "game-command"` and `template`. Choose your own readable label. To add another supported game command, add an action like the example's **List verbs**; no new client handler is required.

Templates have only three constructs:

| Construct | Meaning |
| --- | --- |
| Literal text | The fixed part of the intended game command. |
| `${object}` | Substitute the declared, validated capture named `object`; other declared names work the same way. |
| `$$` | A literal dollar sign in the template itself. |

`${object}` already includes the `#` or `$` prefix. With `$player` captured, `@show ${object}` produces `@show $player`, not a second interpolation. Use the proper delimiter explicitly: `@show ${object}:${verb}` or `@show ${object}.${property}`.

For the shipped fixed Name and Number helper, the JSON template is `;$$string_utils:nn(${object})`, producing exactly `;$string_utils:nn(#123)` or `;$string_utils:nn($player)`. Only the typed object value is variable; no selected prose or arbitrary expression is inserted into that helper.

Unknown/missing placeholders, expression syntax such as `${object.trim()}`, positional replacements such as `$1`, newlines and control characters are rejected. There is no automatic `${selection}` or `${target}` command placeholder. Interpolation happens once, only when the user activates the action.

Configure exactly one intended game command per action. The client sends one single-line input; it does not interpret the game's command or evaluation language to certify that a literal command is read-only. Use trusted fixed command syntax, never try to build a scripting runtime in JSON, and rely on the game to authorize execution. Displaying a menu, matching text, switching profiles or reloading JSON does not send these commands.

## 7. Use native client actions and selected text

Native actions use `type: "client-action"`, an allowlisted `action` ID and an `input` context:

| Action ID | Input | Behavior |
| --- | --- | --- |
| `clipboard.copy` | `target` | Copy the complete matched reference as plain text. |
| `clipboard.copy` | `selection` | Copy the selected output as plain text. |
| `ide.open-scratch` | `selection` | Open only the selected text in the existing IDE Scratchpad. |

Rule actions use `target`; `selectionActions` use `selection`. Keep Copy in the selected-text menu: that menu requires an available Copy action. Available native actions depend on the client/browser, and clipboard permission can still be denied.

The shipped Player profile offers only selected-text Copy. GM, Programmer and the personal example above also offer Scratchpad; a user may explicitly add reference or Scratchpad actions in local JSON. Selected text never becomes a game-command template input. Scratchpad opening neither runs nor uploads the selection. It starts unsaved, so closing warns even without edits. A subsequent Save is a separate explicit action using the existing MOO-saveable Scratchpad workflow and eligibility/permission checks. Multiple scratch tabs do not imply separate server-side scratch records.

Native-action entries cannot supply JavaScript callbacks, URL-opening behavior, module imports, editor upload commands or implementations of new native handlers. New native action IDs require client development. Open at Line is not currently an implemented native context-menu action; the shipped traceback menu offers Copy Frame.

## 8. Client-served profile files and server-selected IDs

Personal imported profiles need no new hosted file or registry entry. For a self-hosted client that should ship an additional profile to everyone:

1. Put a complete document under `data/profiles/`, defining exactly one profile with the intended ID.
2. Add that ID and its known `/profiles/...json` path to the client-owned registry in [`src/shared/context-menu-profiles.js`](../src/shared/context-menu-profiles.js). Merely adding a file does not register it.
3. Rebuild and serve the updated client through your normal deployment process. Player JSON is also bundled as the default/offline document, so changes to that bundled copy require a rebuild.
4. Use **Advanced → Reload context menus** to refetch registered files. Existing local rules/profiles with the same IDs still override those files.

To remove local overrides and use only the registered files, first export a backup, then load this empty local overlay:

```json
{ "version": 1, "rules": [], "profiles": [] }
```

This clears local customizations; it does **not** disable the shipped profiles while their files are available. If the merged registry has no profiles, custom menus are disabled and ordinary browser menus remain. A failed reload retains the previous valid registry instead of partially replacing it.

After detecting the webclient and checking permissions, the game may select an already known ID, for example `#$# SDWC%%CONTEXT-PROFILE%%"programmer"`. It must not send JSON bodies, regexes, templates, paths or URLs. `#$# SDWC%%CONTEXT-RESET` clears the session choice at same-connection logout/character changes. See [Server integration and MOO notify examples](SDWC-OOB.md#selecting-a-logged-in-users-context-menu-profile) for login, role selection and session reset details.

Effective selection is: enabled valid global override, then recognized current-session server ID, then `player`, then the first registered profile, otherwise disabled. The server ID is not persisted across sessions. Selecting a staff-named profile in local Options does not grant staff permissions.

## Troubleshooting and limits

| Symptom | What to check |
| --- | --- |
| New profile is missing from the dropdown | The document must load successfully; check Advanced errors, unique IDs and referenced rule IDs. |
| Player remains active | Check the active label/source. Enable the global override to choose your personal profile; an unknown server ID cannot create a profile. |
| Shipped-file edits do not appear | Reload/refetch registered files, check the local overlay for same-ID replacements, and rebuild if relying on the bundled Player copy. |
| Copy/Scratchpad appears instead of object commands | Clear the genuine text selection, then right-click the reference. Selection menus intentionally take precedence. |
| A matched target offers only Copy | Check the active profile, the winning rule's priority and its action list. GM verb/property menus are intentionally copy-only. |
| Reload fails | Fix the displayed JSON/schema/regex/template error and retry. The last valid configuration remains in use. |
| Ordinary browser menu appears | No applicable/available action, an excluded link/control, pending worker matching or a stale target can preserve the native menu. Shift-right-click always bypasses custom menus. |

Limits enforced by the current implementation (also applied to the merged registry):

- Configuration/fetched-file text: 262144 JavaScript string characters (UTF-16 code units), with an additional 256 KiB byte-size check for browser file imports.
- At most 128 rules and 64 profiles per validated document; a profile may reference at most 128 unique rules.
- Regex source: 1–2048 characters. Priority: integer from -10000 through 10000.
- At most 24 actions per rule or selected-text menu.
- Templates/final commands: at most 2048 characters, single-line and without control characters.
- Matching: at most 32768 characters in a logical row and 512 valid matches per request.
- Worker watchdog: 500 ms per match job, 3 seconds for configuration; the pending request queue is bounded at 256.

For implementation details, the validator and template parser are in [`src/shared/context-menus.js`](../src/shared/context-menus.js), and profile-file loading/merging is in [`src/shared/context-menu-profiles.js`](../src/shared/context-menu-profiles.js). Test configuration with local synthetic fixtures before relying on it in a game.
