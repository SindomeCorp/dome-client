# Website Auth

These instructions describe the optional website-auth login flow used by the web client landing page.

## What It Does

When enabled, users who are not already session-authenticated will see a **[Game Name] Website Login** form on the landing page (`/`).

That form lets users enter website credentials (`email` + `pass`) and submit them to the client backend at:

- `POST /website-login/`

The backend then forwards the credentials to your website auth endpoint, stores the returned user payload in session on success, and redirects back into the client flow.

When disabled, the website login section is not rendered, and `/website-login/` rejects attempts by redirecting to `/` with an error message.

## Enable/Disable

Set these env vars:

- `REMOTEAUTH_ENABLED` (default: `false`)
- `REMOTEAUTH_HOST` (default: `http://localhost`)
- `REMOTEAUTH_PATH` (default: `/session/authenticate/`)
- `REMOTEAUTH_REMOTE_SECRET` (default: `dev-remoteauth-secret-change-me`)

Example:

```env
REMOTEAUTH_ENABLED=true
REMOTEAUTH_HOST=https://your-website-host
REMOTEAUTH_PATH=/session/authenticate/
REMOTEAUTH_REMOTE_SECRET=your-shared-secret
```

## Outbound Request Contract

When a user submits the website-login form, the backend sends an HTTP POST to:

- `<REMOTEAUTH_HOST><REMOTEAUTH_PATH>`

Content type:

- `application/x-www-form-urlencoded`

Body fields sent:

- `email`: user-entered email
- `pass`: user-entered password
- `signature`: `md5(REMOTEAUTH_REMOTE_SECRET)`

## Expected Response Contract

The backend expects JSON.

### Success

Your auth endpoint should return:

```json
{
  "status": "ok",
  "user": {
    "chars": [{ "name": "CharacterName" }],
    "perms": [4]
  }
}
```

Notes:

- `status` must be exactly `"ok"`.
- `user` is stored directly in the session as `req.session.user`.
- `user.chars` is used for character auto-connect behavior.
- `user.perms` is used for admin checks in this client. Return the permission values your game uses for elevated users.

### Failure

Return a non-`ok` status with a message:

```json
{
  "status": "error",
  "message": "Invalid credentials"
}
```

The client will show `message` to the user on redirect.

## Redirect Behavior

After successful auth:

- Default redirect: `/`
- If the form included `gogogo` and `user.chars[0].name` exists: redirect to `/?auto=<first-char-name>`
- If form includes a safe `return` path beginning with `/`, that path overrides the destination.
