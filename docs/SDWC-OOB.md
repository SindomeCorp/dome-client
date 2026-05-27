# SDWC OOB: NOWRAP Markers

This document describes the SDWC out-of-band markers used to control "nowrap blocks" in the Dome Client output buffer:

- `SDWC-START-NOWRAP`
- `SDWC-END-NOWRAP`

These markers are intended for content that should stay visually unwrapped (for example, wide tables, aligned columns, or dense diagnostics) and be horizontally scrollable on small screens.

## Marker Format

The client reads SDWC marker lines from MOO output lines that begin with `#$# `.

Use these exact lines:

```text
#$# SDWC-START-NOWRAP
... your output lines here ...
#$# SDWC-END-NOWRAP
```

## What The Client Does

When the player has `Mobile Friendly Text Wrap` enabled in Client Options:

- On `SDWC-START-NOWRAP`:
  - The client starts a dedicated nowrap block (`.sdwc-nowrap-block`).
  - Following lines render inside that block with horizontal scrolling.
- On `SDWC-END-NOWRAP`:
  - The client closes the active nowrap block.
  - Subsequent output returns to normal wrapping.

When that option is disabled:

- The client ignores both markers and continues normal wrapped output.

Safety behavior:

- Duplicate `SDWC-START-NOWRAP` while already active is ignored with a warning.
- `SDWC-END-NOWRAP` without an active block is ignored with a warning.

## Sending Markers From MOO

At minimum, send marker lines with `notify()`:

```moo
notify(player, "#$# SDWC-START-NOWRAP");
notify(player, "ID    STATE    OWNER        LAST-UPDATE");
notify(player, "1001  OPEN     #123         2026-05-27 09:30:11");
notify(player, "1002  WAITING  #456         2026-05-27 09:31:02");
notify(player, "#$# SDWC-END-NOWRAP");
```

You can use this from command verbs, diagnostics, or helper utilities that emit structured text.

## Recommended Usage

- Emit both start and end markers in the same command flow whenever possible.
- Reserve nowrap blocks for truly width-sensitive text.
- Keep marker spelling exact; these are parsed as literal SDWC control commands.

## Related Client Option

Client Options -> Presentation -> `Mobile Friendly Text Wrap`

- `Yes`: honors `SDWC-START-NOWRAP` / `SDWC-END-NOWRAP`
- `No`: ignores nowrap markers and wraps output normally
