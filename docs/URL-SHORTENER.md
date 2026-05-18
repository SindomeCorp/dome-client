# URL Shortener

This document explains how the web client URL shortener integration works, how to configure it, and what API contract the shortener service must satisfy.

## Feature Toggle

Global toggle:

```env
SHORTEN_ENABLED=false
```

Behavior:
- `SHORTEN_ENABLED=true`: URL shortening is available and users can toggle it in Client Options.
- `SHORTEN_ENABLED=false` (default): URL shortening is fully disabled.
- When disabled, the client options row (`Shorten Long Web Links`) is hidden.
- When disabled, incoming MOO output is never passed to the shortener service.

## Environment Variables

```env
SHORTEN_ENABLED=false
SHORTEN_HOST=localhost
SHORTEN_PORT=5549
SHORTEN_PATH=/interface/v1/shorten/
SHORTEN_DOMAIN=
SHORTEN_MINIMUM=50
```

Meaning:
- `SHORTEN_ENABLED`: master on/off switch.
- `SHORTEN_HOST`: host where the shortener HTTP service is reachable.
- `SHORTEN_PORT`: port for the shortener service.
- `SHORTEN_PATH`: POST endpoint path used by the client server.
- `SHORTEN_DOMAIN`: domain used to construct final short URLs shown to players. Default is empty, so set this when enabling shortening.
- `SHORTEN_MINIMUM`: minimum URL length to consider shortening (with a hard floor of 25 in code).

## Request Sent To The Shortener

For each URL match that qualifies, the web client backend sends:

- Method: `POST`
- URL: `http://<SHORTEN_HOST>:<SHORTEN_PORT><SHORTEN_PATH>`
- Content-Type: `application/x-www-form-urlencoded`
- Body: `url=<urlencoded-original-url>`

Example:

```http
POST /interface/v1/shorten/ HTTP/1.1
Host: localhost:5549
Content-Type: application/x-www-form-urlencoded

url=https%3A%2F%2Fexample.com%2Fvery%2Flong%2Fpath
```

## Expected Response

Response must be JSON containing at least:

- `url`: original URL string (must exactly match submitted URL)
- `key`: short key token

Example:

```json
{
  "url": "https://example.com/very/long/path",
  "key": "abc123"
}
```

When this shape is returned, the client renders the shortened URL as:

```text
http://<SHORTEN_DOMAIN>/<key>
```

## Failure Handling

If the shortener is unreachable, times out, or returns an unexpected payload:
- the original URL remains unchanged in output,
- a warning is logged,
- gameplay output still continues normally.

Default timeout is 2000ms per shortening request.

## Notes

- URL shortening is applied to incoming MOO output lines before they are emitted to the browser.
- Results are cached in-memory per process to reduce duplicate lookups.
