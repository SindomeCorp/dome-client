# SDWC OOB Commands

This document describes Dome Client out-of-band markers sent over MOO output lines and SDWC commands sent from the web client to the MOO.

SDWC markers are used for:
- Output rendering control (nowrap blocks)
- IDE/browser payload exchange
- Connection metadata handshake

## Marker Families

There are two marker styles in active use:

1. Plain control marker lines:

```text
#$# SDWC-START-NOWRAP
#$# SDWC-END-NOWRAP
#$# dome-client-user
```

2. SDWC response payload lines using `%%` segments:

```text
#$# SDWC%%VERBS%%<json>
#$# SDWC%%PROPS%%<json>
#$# SDWC%%VERB-OVERLAY%%<json>
#$# SDWC%%PROP-OVERLAY%%<json>
```

## NOWRAP Output Markers

Use for width-sensitive text that should remain unwrapped and horizontally scrollable.

```text
#$# SDWC-START-NOWRAP
... output lines ...
#$# SDWC-END-NOWRAP
```

Client behavior:
- With output filters enabled, the first nonblank line determines the destination
  of the whole block using the filters selected at its start. Blank-only blocks
  stay in main. Routing is independent of the display preference below; block
  formatting and horizontal scrolling also work in secondary and pop-out views.
- If `Mobile Friendly Text Wrap` is enabled:
  - Starts a nowrap block on `SDWC-START-NOWRAP`
  - Ends it on `SDWC-END-NOWRAP`
- If disabled:
  - Normal wrapping continues; the output-window renderer still keeps the
    marked block together for routing and history limits

Safety behavior:
- Duplicate start while active is ignored (warn-level log)
- End without active block is ignored (warn-level log)

MOO example:

```moo
notify(player, "#$# SDWC-START-NOWRAP");
notify(player, "ID    STATE    OWNER        LAST-UPDATE");
notify(player, "1001  OPEN     #123         2026-05-27 09:30:11");
notify(player, "1002  WAITING  #456         2026-05-27 09:31:02");
notify(player, "#$# SDWC-END-NOWRAP");
```

## IDE Payload Commands

These support web client IDE flows such as Object Browser, Property Browser, hover overlays, and reference metadata.

Requests from client to MOO:

```text
#$# SDWC%%VERBS%%<objectId>
#$# SDWC%%PROPS%%<objectId>
#$# SDWC%%VERB-OVERLAY%%<objectId-or-core-ref>%%<verb>
#$# SDWC%%PROP-OVERLAY%%<objectId-or-core-ref>%%<property>
```

Request controls:
- `IDE_OBJECT_BROWSER_ENABLED=false` disables Object Browser tabs and `SDWC%%VERBS%%` requests.
- `IDE_PROPERTY_BROWSER_ENABLED=false` disables Property Browser tabs and `SDWC%%PROPS%%` requests.
- `IDE_HOVER_OVERLAYS_ENABLED=false` disables `SDWC%%VERB-OVERLAY%%` and `SDWC%%PROP-OVERLAY%%` requests.

Response payloads from MOO to client:

- `#$# SDWC%%VERBS%%<json>`
- `#$# SDWC%%PROPS%%<json>`
- `#$# SDWC%%VERB-OVERLAY%%<json>`
- `#$# SDWC%%PROP-OVERLAY%%<json>`

Notes:
- Payloads should be valid JSON strings.
- The client parses and forwards these to IDE windows; malformed JSON is ignored with warning logs.
- Request payloads are plain `%%` segments; response payloads are JSON after the marker type.

## Connection Metadata Marker (`dome-client-user`)

This marker asks the client to send the MOO a host/IP metadata command. This will include the actual IP/host that the client is connected from, not the web client's IP (which is what would be sent to the MOO on connection).

This is IMPORTANT because you don't want people using your webclient that are newted/toaded/banned/etc. So you may want to integrate the result of these values into various checks to make sure that a webclient user isn't a banned user.

Marker flow:

1. MOO emits:

```text
#$# dome-client-user
```

2. Client responds:

```text
@dome-client-user <hostname-or-ip>
```

`<hostname-or-ip>` is:
- reverse-DNS hostname when available, or
- client IP fallback

MOO verb setup:

```moo
@verb <player parent>:@dome-client-user any any any rxd
@program <player parent>:@dome-client-user
```

Example verb body:

```moo
"Record dome-client supplied host/ip metadata for this session.";
set_task_perms(player);
host_or_ip = argstr;
if (!host_or_ip || host_or_ip == "")
  return player:notify("[dome-client] missing host/ip payload.");
endif

player.all_connect_places = {@player.all_connect_places, host_or_ip};
player:notify(tostr("[dome-client] connect host/ip registered: ", host_or_ip));
```

Trigger from connect/login flow:

```moo
notify(player, "#$# dome-client-user");
```

## Selecting a logged-in user's context-menu profile

After your login flow identifies a Dome webclient session, choose a profile using the logged-in user's current role/permissions. Send one standalone output line with a JSON string ID:

```text
#$# SDWC%%CONTEXT-PROFILE%%"player"
#$# SDWC%%CONTEXT-PROFILE%%"gm"
#$# SDWC%%CONTEXT-PROFILE%%"programmer"
```

Send only the appropriate line, not all three. In MOO code these are:

```moo
notify(player, "#$# SDWC%%CONTEXT-PROFILE%%\"player\"");
notify(player, "#$# SDWC%%CONTEXT-PROFILE%%\"gm\"");
notify(player, "#$# SDWC%%CONTEXT-PROFILE%%\"programmer\"");
```

Integrate the appropriate notification into your existing successful login/webclient detection path. The metadata exchange above may be part of that integration, but a client-supplied marker or role ID is never proof of staff permission. Use your game's own Programmer/Support GM eligibility checks to choose the ID; actual menu commands remain subject to ordinary MOO authorization. The client sends no command in response to profile selection. A command is sent only after explicit menu activation.

The built-in client registry maps `player`, `gm` and `programmer` to separate client-owned files under `data/profiles/`. IDs are case-sensitive; lowercase IDs with hyphens and underscores are supported, and those characters are distinct. Additional IDs must first be registered/loaded in the client. Never send profile bodies, regexes, templates, executable code, file paths or URLs through OOB. Unknown IDs, malformed payloads and unavailable/invalid registered files clear the previous server choice and fall back to Player or the first available profile; without a usable profile, menus are disabled.

The choice lasts only for the current session. Resend the correct ID after login/reconnect and after role changes, including `player` when leaving a staff role. Before a same-connection logout or character switch, clear the old choice with:

```moo
notify(player, "#$# SDWC%%CONTEXT-RESET");
```

Then select the newly logged-in user's profile. Transport disconnect/reconnect also clears the recognized server choice automatically. The global **Options → Context Menus → Basic → Override server context menu selection** setting wins while checked; unchecking restores the latest recognized server choice for this session, or fallback. Check the durable **Active Profile** label/source when troubleshooting. `CONTEXT_MENUS_ENABLED=false`, or startup with no usable registered JSON files, disables the feature regardless of OOB or saved local overrides. See [Context Menus](CONTEXT-MENUS.md) and the [JSON authoring guide](CONTEXT-MENU-JSON.md).

## Operational Recommendations

- Keep marker spelling exact; matching is literal for control markers.
- Emit start/end pairs in the same command flow when possible.
- Use SDWC payload markers only for machine-readable client metadata (JSON).
- Keep gameplay/player-visible text separate from SDWC marker lines.
