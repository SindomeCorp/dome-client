# Health Endpoint

The web client exposes `GET /health/` as a lightweight process health endpoint for load balancers, uptime checks, and deployment monitoring.

This endpoint reports the health of the Dome Client Node.js process. It is separate from the optional status-service integration documented in `docs/STATUS-SERVICE.md`, which reports MUD/server status through `GET /moo/status/`.

## Configuration

Set this in your environment:

- `HEALTH_ENDPOINT_ENABLED` (default: `true`)

Examples:

```env
# Expose GET /health/
HEALTH_ENDPOINT_ENABLED=true

# Do not register GET /health/
HEALTH_ENDPOINT_ENABLED=false
```

When disabled, `/health/` is not registered and returns the normal not-found response.

## Request

- Method: `GET`
- Path: `/health/`
- Authentication: none
- Response type: JSON

## Response Shape

Example response:

```json
{
  "currentRss": 73433088,
  "currentHeapUsed": 17342568,
  "currentlyConnected": 12,
  "cpuLoad": {
    "1m": 0.42,
    "5m": 0.38,
    "15m": 0.31
  },
  "lastRestart": "2026-06-04T15:23:19.123Z"
}
```

Fields:

- `currentRss` (number): resident set size from `process.memoryUsage().rss`, in bytes.
- `currentHeapUsed` (number): active V8 heap usage from `process.memoryUsage().heapUsed`, in bytes.
- `currentlyConnected` (number): active Socket.IO clients across HTTP and HTTPS socket servers.
- `cpuLoad` (object): operating-system load averages from `os.loadavg()`, keyed by `1m`, `5m`, and `15m`.
- `lastRestart` (string): ISO 8601 timestamp for the app start time.

## Operational Notes

- The endpoint returns HTTP 200 when enabled and the web client process can serve requests.
- The response does not include external MUD reachability or status-service state.
- The route is skipped by request logging to avoid noisy health-check logs.
- If your deployment exposes public routes directly, disable this endpoint with `HEALTH_ENDPOINT_ENABLED=false` and use a private platform or reverse-proxy health check instead.
