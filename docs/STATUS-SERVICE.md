# Status Service

This feature adds a MOO/server health indicator to the web client UI.

When enabled, the player client shows:

- A status icon (globe) in the main client status bar.
- A health detail overlay on hover/click.
- CPU usage, RAM usage, connected users, message/state, and last check time.
- Trend graphs for CPU, RAM, and users over recent checks.

When disabled, the icon/overlay are hidden and the web client does not run status polling checks.

## Environment Variable

Set this in your environment:

- `STATUS_SERVICE_URL` (default: empty)

Examples:

```env
# Full endpoint
STATUS_SERVICE_URL=https://status.example.com/moo/status/

# Host only (auto-expanded by the app)
STATUS_SERVICE_URL=status.example.com
```

If you provide only a host (like `status.example.com`), the web client treats it as:

- `https://status.example.com/moo/status/`

## What Request Is Made

The web client backend polls the status endpoint every 15 seconds.

Request:

- Method: `GET`
- URL: value derived from `STATUS_SERVICE_URL`
- Expected content type: JSON response

The browser client then requests local endpoint `GET /moo/status/`, which returns the latest cached status from that backend poll.

## Expected Response Shape

The status service should return JSON like:

```json
{
  "message": "moo ok",
  "cpu": 12.5,
  "memory": 834404352,
  "checked": 1735689600000,
  "users": 42,
  "interval": 15,
  "state": "OK"
}
```

Field expectations:

- `message` (string): user-facing status text.
- `cpu` (number): CPU usage percentage.
- `memory` (number): memory usage in bytes.
- `checked` (number): Unix epoch time in milliseconds.
- `users` (number): current connected user count.
- `interval` (number): optional service-side interval hint.
- `state` (string): status state, commonly `OK` when healthy.

## Operational Notes

- Keep `STATUS_SERVICE_URL` empty to disable this feature completely.
- If your service uses HTTP instead of HTTPS, set a full URL including `http://`.
- This service is intended to run near your MOO host and report machine/process health for operators and players.
