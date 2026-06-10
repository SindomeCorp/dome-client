# Production Deployment

This guide describes the minimum production setup for Dome Client when optional sidecar services, such as the status service, URL shortener, remote website auth, and autocomplete, are not being enabled.

## Production Checklist

- Point a public DNS record, such as `play.example.com`, at the server.
- Install Node.js 22+, npm, git, Supervisor, and Certbot.
- Copy `.env-example-production` to `.env` and update the required production values.
- Generate a strong `SESSION_SECRET`.
- Configure `NODE_SOCKET_URL` and `NODE_SOCKET_URL_SSL` to the public URL players will open in their browsers.
- Configure `MUD_NAME`, `MUD_HOST`, `MUD_PORT`, and `GUEST_CONNECT_COMMAND` for the backend game.
- Generate or install TLS certificates and set `SSL_KEY` and `SSL_CERT`.
- Keep optional service flags disabled unless their services are actually deployed.
- Run the app under Supervisor, systemd, or another process manager.
- Open only the required firewall ports, usually 80 and 443 for web traffic plus any private management ports you use.

## Install

Ubuntu example:

```bash
sudo apt update
sudo apt install -y nodejs npm git supervisor certbot
git clone https://github.com/SindomeCorp/dome-client.git
cd dome-client
npm install
cp .env-example-production .env
```

Edit `.env` before starting the service.

## Required Environment

These values normally need production-specific settings:

```env
NODE_MODE=production
NODE_PORT=80
LOG_LEVEL=info
SESSION_SECRET=replace-with-a-long-random-secret

NODE_SOCKET_URL=https://play.example.com
NODE_SOCKET_URL_SSL=https://play.example.com
NODE_SOCKET_PROXIED=false

SSL_PORT=443
SSL_KEY=/etc/letsencrypt/live/play.example.com/privkey.pem
SSL_CERT=/etc/letsencrypt/live/play.example.com/fullchain.pem
SSL_PASSPHRASE=

MULTI_MUD=false
MUD_NAME=ExampleMUD
MUD_HOST=mud.example.com
MUD_PORT=5555
GUEST_CONNECT_COMMAND=connect guest
WEBSITE_SIGNUP_URL=https://www.example.com/signup

HEALTH_ENDPOINT_ENABLED=true
IP_BLOCKLIST_PATH=

REMOTEAUTH_ENABLED=false
STATUS_SERVICE_URL=
SHORTEN_ENABLED=false
AUTOCOMPLETE_ENABLED=false
```

Generate a session secret with:

```bash
openssl rand -base64 48
```

Use the generated value for `SESSION_SECRET`. Do not commit the resulting `.env`.

## Let's Encrypt Certificates

Dome Client enables HTTPS when both `SSL_KEY` and `SSL_CERT` are set. With Let's Encrypt, use Certbot to create a standalone certificate before the Node process is listening on port 80:

```bash
sudo certbot certonly --standalone -d play.example.com
```

Then set:

```env
SSL_KEY=/etc/letsencrypt/live/play.example.com/privkey.pem
SSL_CERT=/etc/letsencrypt/live/play.example.com/fullchain.pem
SSL_PORT=443
NODE_SOCKET_URL=https://play.example.com
NODE_SOCKET_URL_SSL=https://play.example.com
```

Certbot installs a renewal timer on most Linux distributions. Check it with:

```bash
systemctl list-timers --all | grep certbot
```

Because Dome Client reads the certificate files only at startup, restart the process after certificate renewal. With Supervisor:

```bash
sudo supervisorctl restart dome-client
```

If Certbot needs port 80 for renewal and Dome Client is bound directly to port 80, configure a deploy hook that stops and restarts the app around renewal, or put a reverse proxy such as nginx in front of Dome Client and let the proxy handle ACME challenges and TLS termination.

## Running the Service

The repository includes `supervisor.conf`. Review the paths first; the checked-in file assumes the app lives at `/home/ubuntu/dome-client`.

```bash
sudo ln -s "$(pwd)/supervisor.conf" /etc/supervisor/conf.d/dome-client.conf
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start dome-client
```

The included Supervisor config runs as `root` so the app can bind to ports 80 and 443 and read Let's Encrypt keys under `/etc/letsencrypt`. If you run as a non-root user, either grant Node permission to bind low ports, bind to high local ports behind a reverse proxy, or adjust certificate file permissions carefully.

## Production vs Development Differences

Production differs from local development in these areas:

- Public URLs: `NODE_SOCKET_URL` and `NODE_SOCKET_URL_SSL` must be browser-reachable public URLs. Local development usually uses `http://localhost:8080`.
- TLS: production should serve HTTPS, either directly with `SSL_KEY` and `SSL_CERT` or through a reverse proxy. Local development commonly leaves those blank.
- Ports: production usually binds 80 and 443. Local development uses an unprivileged port such as 8080.
- Secrets: production needs a unique, high-entropy `SESSION_SECRET`; development examples use throwaway values.
- Runtime mode: set `NODE_MODE=production` so templates suppress debug behavior.
- Process management: production should use Supervisor, systemd, or equivalent restart/log management. Development usually runs `npm start` in a shell.
- Proxy headers: set `NODE_SOCKET_PROXIED=true` only when Dome Client is behind a trusted reverse proxy or load balancer. Leave it `false` when Node is exposed directly.
- Health checks: production can expose `/health/` with `HEALTH_ENDPOINT_ENABLED=true` for monitoring. Disable it if your routing setup should not expose process details publicly.
- Optional integrations: leave `REMOTEAUTH_ENABLED=false`, `STATUS_SERVICE_URL=`, `SHORTEN_ENABLED=false`, and `AUTOCOMPLETE_ENABLED=false` unless those services and MOO-side integrations are deployed.
- Sessions: the app uses the default in-process session store. A restart clears web sessions, and multiple Node processes will not share session state without additional application changes.
- Build artifacts: startup runs the asset build automatically, but release workflows should still run `npm run build`, `npm run lint`, and `npm test` before deployment.

## Smoke Test

After starting the service:

```bash
curl -I http://play.example.com/
curl -I https://play.example.com/
curl https://play.example.com/health/
```

Then open `https://play.example.com` in a browser and confirm that a player can connect to the configured `MUD_HOST` and `MUD_PORT`.

