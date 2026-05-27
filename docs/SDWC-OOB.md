# SDWC OOB Commands

This document describes Dome Client out-of-band markers sent over MOO output lines (prefixed with `#$# `).

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

2. SDWC payload lines using `%%` segments:

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
- If `Mobile Friendly Text Wrap` is enabled:
  - Starts a nowrap block on `SDWC-START-NOWRAP`
  - Ends it on `SDWC-END-NOWRAP`
- If disabled:
  - Markers are ignored and normal wrapping continues

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

These are consumed by the web client IDE flows (object browser, overlays, etc.).

Response payloads from MOO to client:

- `#$# SDWC%%VERBS%%<json>`
- `#$# SDWC%%PROPS%%<json>`
- `#$# SDWC%%VERB-OVERLAY%%<json>`
- `#$# SDWC%%PROP-OVERLAY%%<json>`

Notes:
- Payloads should be valid JSON strings.
- The client parses and forwards these to IDE windows; malformed JSON is ignored with warning logs.

## Connection Metadata Marker (`dome-client-user`)

This marker asks the client to send the MOO a host/IP metadata command. This will include the actual IP/host that the client is connected from, not the webclient's IP (which is what would be sent to the MOO on connection). 

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

## Operational Recommendations

- Keep marker spelling exact; matching is literal for control markers.
- Emit start/end pairs in the same command flow when possible.
- Use SDWC payload markers only for machine-readable client metadata (JSON).
- Keep gameplay/player-visible text separate from SDWC marker lines.
