# Autocomplete

This document explains how server-backed command autocomplete is configured and toggled.

## Feature Toggle

Global toggle:

```env
AUTOCOMPLETE_ENABLED=false
```

Behavior:
- `AUTOCOMPLETE_ENABLED=false` (default): `/ac/:type` returns an empty list.
- `AUTOCOMPLETE_ENABLED=true`: `/ac/:type` loads command data from configured files.

## Environment Variables

```env
AUTOCOMPLETE_ENABLED=false
AUTOCOMPLETE_P=data/autocomplete/player.txt
AUTOCOMPLETE_J=data/autocomplete/justice.txt
AUTOCOMPLETE_A=data/autocomplete/agent.txt
AUTOCOMPLETE_C=data/autocomplete/creator.txt
AUTOCOMPLETE_W=data/autocomplete/watcher.txt
AUTOCOMPLETE_O=data/autocomplete/guest.txt
```

Meaning:
- `AUTOCOMPLETE_ENABLED`: master on/off switch for backend autocomplete data.
- `AUTOCOMPLETE_P/J/A/C/W/O`: command-list files keyed by user type.

## File Format

Each file should contain one command per line.

Supported line styles:
- Plain command only:

```text
help
@who
```

- Command with description fields:

```text
connect <name> <password> | Login as character | Optional extra notes
```

The client consumes these lines as-is for suggestion rendering.

## Endpoint Behavior

Route:

- `GET /ac/:type`

Examples:
- `GET /ac/p` reads `AUTOCOMPLETE_P` when enabled.
- `GET /ac/o` reads `AUTOCOMPLETE_O` when enabled.

If a type is unknown or not configured, the endpoint returns `[]`.

## Troubleshooting

- Endpoint always returns `[]`:
  - Confirm `AUTOCOMPLETE_ENABLED=true`.
- Endpoint returns 500:
  - Check that the configured file path exists and is readable by the server process.
- Changes to autocomplete files not reflected:
  - Restart the service (autocomplete data is cached in memory).
