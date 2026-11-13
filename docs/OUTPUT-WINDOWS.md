# Output windows, scrollback, Find, and logs

The terminal keeps one ordered history for the current session and displays only
the part near each window's scroll position. A split gives you two views of that
history, with one shared command input. Routed messages are stored once.

## Open and configure a split

1. Choose **SPLIT** in the terminal toolbar.
2. Open **Options → Output Windows**, or choose **Configure output window** in the
   empty secondary window.
3. Select the channel filters to send matching future lines to secondary.
4. Choose secondary on the right, left, above, or below main.

The initial split gives secondary 30% of the output area. Drag the divider with a
mouse or touch to resize it. You can also focus the divider and use the arrow keys
to adjust it by two percentage points; Home selects 15% and End selects 85%.
Splits remain available on narrow screens. Both windows share your output font,
font size, and color scheme.

Each window has independent Pause/Resume and unread counts. The toolbar's Pause
Scroll button always controls main; secondary has a matching button in its own
header. The Pause/Break shortcut affects the last active output window, defaulting
to main. Existing scroll-up, double-click, and long-click preferences apply to
each window independently.
When double-click is configured to toggle scrolling, pausing or resuming either
pane returns the cursor to the shared command input without changing its text.

The toolbar stays in the main window at its original top position when its full
labels fit. On smaller screens, or when resizing leaves main too narrow, the
controls move to the bottom and use the existing compact layout. A single output
window has no extra Main header or duplicate Pause button. Output Windows is the
fourth tab in Client Options.
Bottom controls wrap to keep Log and Pause Scroll visible. Main unread counts
appear immediately before Split/Close Split. Secondary controls have a transparent
background, and the empty pane shares the output theme and pause indicator before
the first matching line arrives.

Selecting a filter does not open a split. Existing messages remain in their
assigned windows when you change filters. Closing secondary makes all retained
messages available in main in their original order, after a confirmation. This
applies to both Close Split buttons and choosing Single window in options.
Opening it again starts with
an empty secondary window and routes future matching messages.

**Clear Buffer** clears both windows and their retained history, including what
would otherwise be exported in a log. Your filters and layout remain saved.

## Channel presets and custom filters

The default [preset file](../data/output-window-presets.json) contains one
Player preset, **Channels**, matching `[+]` (primary channel) or `[-]` (secondary
channels) at the start of a line (`^\[[+-]\]`). Player Filters opens by default. Operators can add presets to
the Player, GM, and Coder groups for their game.

The [Sindome example catalog](../data/sindome-output-window-presets.json) shows how
a real game uses named channels and other output patterns across these groups.
It is an optional example, not the default configuration. To use it, set:

```env
OUTPUT_WINDOWS_PRESETS_PATH=data/sindome-output-window-presets.json
```

Restart the server after changing the path or preset file.

Custom Filters contains rules you create yourself. Each button shows selected/total
counts, such as **Player Filters [1/1]**. Changing the visible group does not disable
checked rules in other groups. New custom rules start unchecked.
Filters are listed alphabetically by name within each group, including Custom.
Filter checkboxes use three columns on wide screens, two on medium screens, and
one on narrow screens. Custom-filter names and edit/delete controls wrap within
their column.

For example, the default Channels pattern is:

```text
^\[[+-]\]
```

It matches both `[+][Example] Player: Hello.` and `[-][Example] Player: Hello.`,
but not
`Player quoted [-][Example] in another message.`.

Filters test whole incoming lines before display enhancements, ignoring ANSI
color codes. A long line wrapping onto several screen rows is still one incoming
line. If any enabled rule matches, the line appears once in secondary and is
absent from main until the split closes.

Game-marked SDWC nowrap blocks stay together in main, even when their contents
match a filter. Their lines share a horizontal scroll position when nowrap
display is enabled. History limits remove a complete chronological prefix through
the end of a block when the limit cuts into it, including any command echo
between its lines. Further lines of an unfinished, removed block are discarded
until its end marker. See [SDWC protocol markers](SDWC-OOB.md).

When custom filters are allowed:

1. Enter a descriptive **Name**.
2. Enter a JavaScript regular expression **Pattern**, without surrounding slash
   delimiters. For instance, enter `^You hear` rather than `/^You hear/`.
3. Optionally check **Ignore case**.
4. Paste sample output and choose **Test**. The results identify matching lines.
5. Choose **Add filter**, then enable its checkbox.

Invalid names or patterns cannot be saved. Use **Edit** to change a custom rule.
Use its × control and confirm to delete it. Game presets can only be enabled or
disabled; players cannot edit or delete them.

Matching and testing run in a background worker. A rule that takes longer than
one second is suspended for that session, with an explanation. Unresolved output
stays in main. Edit the rule or toggle its checkbox to retry. If background workers
are unavailable, output stays in main.

Pruning history also discards queued routing work for removed lines. Pending
routing is capped at 8,192 logical lines, even with unlimited history. If a slow
worker falls behind that budget, queued overflow stays in main in receipt order.
An obsolete batch already running can finish under its existing one-second
watchdog; it does not keep discarded records alive or suspend an obsolete rule.

## Offscreen rendering and long sessions

Retained history and displayed content are different:

- History contains compact formatted text records, in receipt order.
- Each window mounts only rows around its current viewport, with a small
  surrounding buffer for scrolling.
- Offscreen rows release their display elements. Scrolling back creates the
  required rows again without repeating sounds, alerts, or protocol actions.
- Measured and estimated row heights support wrapped text and large histories.
  Heights are refined as rows appear; resizing does not measure all old output.
- Active image, video, and YouTube previews exist only in mounted rows. Moving
  offscreen releases them; remounted media starts collapsed and can be expanded
  again. Playback position is not preserved.

See [Inline media previews](IMAGE-PREVIEWS.md) for supported links.

This reduces rendering work and the number of live page elements. It does not
make retained text free. **Scroll Buffer Size** is a shared logical-line limit
across both windows, including blank lines. Zero means unlimited history.
When a limit cuts through a marked block, its remaining lines are removed
together so a partial table or map is not retained.

History stays in memory for this page session. Reconnects preserve retained
history; refreshing or closing the page does not restore it. No history is written
to local storage or uploaded as part of this feature.

With **Scroll Up to Pause** disabled (the default), scrolling back keeps your
position through repaints and size measurements. New output resumes scrolling
to the bottom unless you explicitly pause that window. Enable **Scroll Up to
Pause** to remain paused automatically while reading old output.

Performance measurements and replay instructions are in
[Output performance](OUTPUT-PERFORMANCE.md).

## Find across all retained output

Choose **FIND** or press **Ctrl+F** / **Cmd+F** in the terminal. This opens the
client's Find rather than the browser's native Find.

Find searches literal text, ignoring case by default. Enable **Match case** when
needed. Choose **All output**, **Main**, or **Secondary**; secondary is available
only while the split is open.

Use the arrow buttons, Enter, or F3/Shift+F3 to move between matches. The matching
window pauses and displays the result, even if that message was previously
offscreen. Incoming output updates the result set without automatically moving
you to a new match. Escape closes Find and returns focus.

Live updates scan only lines received since the previous search. Result locations
use compact counts per matching line; individual character offsets are resolved
as you navigate. Common terms can produce millions of matches without keeping
millions of separate location objects. This index still grows with the number
of matching retained lines and is released when Find closes or history clears.

The browser's own Find cannot reliably search messages that are not mounted.
Use client Find for complete retained-history searches. Editor Find shortcuts
remain with the editor, and Ctrl+R continues to search command history.

Rows mounting while you scroll are not announced again as new output to screen
readers. New output uses a separate announcement region. Panel controls, divider,
Find, and copying actions are keyboard accessible.

## Select and copy text

Use normal mouse selection and Ctrl/Cmd+C. Scrolling while selecting continues
to render older output; only the selection endpoints stay mounted outside the
viewport. When a selection spans unmounted lines, the client copies the retained
text between its endpoints, including those lines and partial boundary lines.
Ordinary selections within mounted content use the browser's normal copy action.
The client prepares offscreen text in the background as the selection changes,
then supplies it through the browser's normal Copy action without requesting
additional clipboard permission. If a large selection is still preparing when
you copy, a status message asks you to copy again when it is ready. No partial
selection is placed on the clipboard. Changing or clearing the selection cancels
preparation and releases the prepared text.

Browser Select All only sees mounted content. To save the complete retained
session, use **Log**. A selection is cleared with an explanation if its endpoints
are pruned by the history limit. Closing a split releases selections in that pane
when its content returns to main.

## Unified log exports

**LOG** exports all retained messages once, in receipt order, regardless of
window assignment or whether messages are mounted. Local echo and client output
are included. Setup help, Find controls, spacing elements, and live media players
are excluded.

Logs retain ANSI styling, links, and nowrap formatting. Media URLs and preview
controls remain; previews start collapsed and can be opened in the saved log
without the running client. Media loads only when opened and is released when
collapsed. The log includes a small script for these controls; active player
state is not captured. **Embed CSS In Saved Logs**
continues to choose between self-contained CSS and legacy linked stylesheets.
The native application's download integration remains supported.

Preparation runs in chunks with progress and a Cancel button. Search, copying,
and export use a fixed history boundary so new arrivals do not move that
operation's endpoint. Clear Buffer cancels pending operations.

Large clipboard operations and exports still need temporary memory proportional
to their output. Native log downloads may require one complete HTML string.
Offscreen rendering does not remove those final allocation costs.

## Preferences and operator configuration

Layout, size, selected presets, and custom rules are saved in local storage,
shared across games served from the same browser origin. They are included in
the normal preference export's versioned `outputWindows` section.

Older preference files without that section leave these settings unchanged.
Invalid imported custom rules are skipped and reported. Reset to Defaults
removes custom rules, clears filter selections, and closes the split while
preserving retained session output.

Operators can set:

| Variable | Default | Purpose |
| --- | --- | --- |
| `OUTPUT_WINDOWS_ENABLED` | `true` | Show split controls and enable routing. |
| `OUTPUT_WINDOWS_CUSTOM_REGEX_ENABLED` | `true` | Allow custom rules and the tester. |
| `OUTPUT_WINDOWS_PRESETS_PATH` | `data/output-window-presets.json` | Preset JSON loaded at startup. |

Disabling splits does not disable efficient rendering, Find, or copying.
Saved split preferences remain stored. Disabling custom regex preserves saved
custom rules but prevents execution and editing, including rules imported from
another installation. Imports skip custom-rule changes while custom regex is
disabled, preserving existing custom rules. Disabled custom rules can be used
again if re-enabled.

The preset path is relative to the repository root unless absolute. Its contents
are an array of entries:

```json
[
  {
    "id": "channels",
    "name": "Channels",
    "pattern": "^\\[[+-]\\]",
    "ignoreCase": false,
    "group": "player"
  }
]
```

JSON requires doubled backslashes. Keep IDs stable when renaming presets so
saved checkbox selections survive. The optional `group` is `player`, `gm`, or `coder`;
files without it default entries to Player Filters. Unknown groups are skipped
with a warning. The older `admin` group name is accepted as `gm`. User-created
rules always appear under Custom Filters.
IDs must be unique; `custom-` IDs are
reserved for player rules. Invalid entries are logged and skipped. An unreadable
or invalid file logs a warning and supplies no presets without preventing startup.
An empty array is valid. Restart the server after changing this file.
