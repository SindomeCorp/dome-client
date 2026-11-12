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
Scroll control and Pause/Break shortcut affect the last active output window,
defaulting to main. Existing scroll-up, double-click, and long-click preferences
apply to each window independently.

Selecting a filter does not open a split. Existing messages remain in their
assigned windows when you change filters. Closing secondary makes all retained
messages available in main in their original order. Opening it again starts with
an empty secondary window and routes future matching messages.

**Clear Buffer** clears both windows and their retained history, including what
would otherwise be exported in a log. Your filters and layout remain saved.

## Channel presets and custom filters

The supplied presets cover Team Chat, Game Help, OOC Chat, Bit Chat, RP Info,
SIC Comm, Debug Info, Guided Discussion, and OOC Messages beginning with `[OOC:`.
They are case-sensitive and anchored at the start of a line.

For example, the Team Chat pattern is:

```text
^\[-\]\[Team-Chat\]
```

It matches `[-][Team-Chat] Atlas: Hello.`, but not
`Atlas quoted [-][Team-Chat] in another message.`.

Filters test whole incoming lines before display enhancements, ignoring ANSI
color codes. A long line wrapping onto several screen rows is still one incoming
line. If any enabled rule matches, the line appears once in secondary and is
absent from main until the split closes.

Game-marked SDWC nowrap blocks stay together in main, even when their contents
match a filter. Their lines share a horizontal scroll position when nowrap
display is enabled. See [SDWC protocol markers](SDWC-OOB.md).

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

The browser's own Find cannot reliably search messages that are not mounted.
Use client Find for complete retained-history searches. Editor Find shortcuts
remain with the editor, and Ctrl+R continues to search command history.

Rows mounting while you scroll are not announced again as new output to screen
readers. New output uses a separate announcement region. Panel controls, divider,
Find, and copying actions are keyboard accessible.

## Select and copy text

Normal mouse selection works within displayed content. Selected mounted rows
are temporarily held in place so incoming output cannot remove the selection.
Use the range tools for selections extending beyond the mounted area:

1. Click an output line, or focus the output region and use arrow/Page Up/Page Down
   keys to choose a line.
2. Open that window's **Copy…** menu and choose **Select from here**.
3. Scroll or Find the other boundary, choose its line, and select
   **Select to here**.
4. Choose **Copy selection**.

Boundaries include their entire logical lines. Reverse selections are supported.
Only messages belonging to that window are included. **Copy all** copies all
retained messages assigned to that window. These actions copy plain text with
line breaks and do not mount the selected history.

Browser Select All only sees mounted content; use **Copy all** for the entire
retained window.

If pruning removes part of your selected range, the range is cleared with an
explanation. Opening or closing a split also clears logical ranges because window
assignments change. Clipboard access requires browser permission/support; normal
selection and HTML log downloads remain alternatives.

## Unified log exports

**LOG** exports all retained messages once, in receipt order, regardless of
window assignment or whether messages are mounted. Local echo and client output
are included. Setup help, Find controls, spacing elements, and live media players
are excluded.

Logs retain ANSI styling, links, and nowrap formatting. Media URLs and preview
controls remain; active player state is not captured. **Embed CSS In Saved Logs**
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
    "id": "team-chat",
    "name": "Team Chat",
    "pattern": "^\\[-\\]\\[Team-Chat\\]",
    "ignoreCase": false
  }
]
```

JSON requires doubled backslashes. Keep IDs stable when renaming presets so
players retain checkbox selections. IDs must be unique; `custom-` IDs are
reserved for player rules. Invalid entries are logged and skipped. An unreadable
or invalid file logs a warning and supplies no presets without preventing startup.
An empty array is valid. Restart the server after changing this file.
