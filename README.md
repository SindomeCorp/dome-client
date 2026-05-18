# Dome Client

> Modern, actively maintained browser MUD client for LambdaMOO/ToastStunt and compatible MUD servers.

[![Node.js](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](#requirements)
[![License](https://img.shields.io/badge/license-BSD--3--Clause-blue.svg)](LICENSE.txt)

Dome Client is the maintained successor to [Legacy Dome Client](https://github.com/javaChilly/dome-client.js), with ongoing fixes, modernized dependencies, and expanded documentation.

It is a browser-based MUD client built with Node.js, Express, and Socket.io. It bridges browser WebSocket connections to traditional telnet-based MOO servers, so players can connect without plugins.

**Quick links:** [Requirements](#requirements) · [Installation](#installation) · [Setup Guides](#setup-guides) · [Contributing](#contributing)

**Tech keywords:** `mud client`, `moo client`, `lambdamoo`, `toaststunt`, `websocket`, `telnet bridge`, `browser mud`

## Features

- ANSI/Xterm-style color rendering with multiple color presets and readable monospace font options.
- Browser-based MOO play over WebSocket with no plugin/Flash dependency.
- HTTPS support (optional) with separate HTTP/HTTPS Socket.io listeners when SSL certs are configured.
- Built-in IDE editor for verb and property editing, including multi-tab editing workflows.
- Object Browser and Property Browser panes in the IDE for fast navigation across loaded objects.
- Ctrl/Cmd-click code navigation in the IDE (`@edit` target jumps), with optional parent-chain lookup support.
- Hover overlays in the IDE for verb/property metadata lookups via SDWC out-of-band commands.
- Optional VMS note workflow for program saves (can append a commit-style note line after `@program` saves).
- Scratch pad workflow (`@scratch` / `@edit me.scratch`) for temporary editing and recall.
- Optional URL-shortener integration for long links in MOO output (globally toggleable and user-toggleable).
- Rich client options: command hints, local echo, image preview, overlay transparency, buffer size, alert sound, font/theme choices, and editor mode selection.
- Session log export as HTML for preserving and sharing scrollback.
- Built-in keyboard shortcuts for both client and IDE workflows.

## Requirements

- Node.js 22+
- npm

## Installation

1. Install system dependencies (Ubuntu example):
   ```bash
   sudo apt update
   sudo apt install -y nodejs npm git supervisor
   ```
   Ensure Node.js is v22 or newer (use NodeSource or nvm if the Ubuntu package is older).
2. Clone the repository and install npm packages:
   ```bash
   git clone https://github.com/SindomeCorp/dome-client.git
   cd dome-client.js
   npm install
   ```
3. Copy `.env-example-local` (for local/dev) or `.env-example-production` (for production) to `.env` and adjust for your environment.
   - `LOG_LEVEL` sets log verbosity.
   - For MOO-side integration, see [docs/MOO-SETUP.md](docs/MOO-SETUP.md)
4. Start the development server:
   ```bash
   npm start
   ```
   Assets compile automatically at startup. For production builds, run `npm run build` before launching the service.
5. Connect in your browser to the NODE_SOCKET_URL defined in your .env. For example: http://localhost:8080
All environment variables and defaults live in [`src/env.js`](src/env.js). Example configurations are provided in [`.env-example-local`](.env-example-local) and [`.env-example-production`](.env-example-production).

### Supervisor deployment

The repository ships with [`supervisor.conf`](supervisor.conf) for managing the process via Supervisor on Ubuntu. Link it into Supervisor's configuration directory and reload:

```bash
sudo ln -s "$(pwd)/supervisor.conf" /etc/supervisor/conf.d/dome-client.conf
sudo supervisorctl reread
sudo supervisorctl update
```

After linking, manage the service with `sudo supervisorctl start dome-client`, `sudo supervisorctl restart dome-client`, etc. Adjust the paths inside `supervisor.conf` if the repository lives somewhere other than `/opt/dome-client`.

## Project structure

All application code resides in `src/` and follows a layered design:

- `src/server.js` starts the Express application.
- `src/config/` builds configuration objects from environment variables.
- `src/routes/` maps HTTP routes to controllers.
- `src/controllers/` handle request and response logic.
- `src/services/` contain reusable domain logic.
- `src/middleware/` contains middleware helpers (for example error and LESS middleware).
- `src/logger.js` exposes a shared Winston logger.
- `src/env.js` defines and validates environment variables.
- View templates live in `views/`; see [`views/README.md`](views/README.md) for directory layout and templating guidelines.

Controllers may depend on services and configuration, but services remain independent of Express. Tests live in `test/` and mirror this structure.

## Editor

The in-browser editor uses [Ace](https://ace.c9.io/) v1.43.2 with a custom MOO mode and optional Vim keybindings. Custom modules live under `src/client/ace` and are bundled during the build. Run `npm start` or `npm run build` after editing these modules to regenerate client assets. See [docs/ace-notes.md](docs/ace-notes.md) for details.

## Setup Guides

### MOO Verbs for Local Editing
- [MOO Verbs Setup](docs/MOO-SETUP.md)

### Advanced Setup
- [Autocomplete](docs/AUTOCOMPLETE.md)
- [URL Shortener](docs/URL-SHORTENER.md)
- [Website Auth](docs/WEBSITE-AUTH.md)
- [Status Service](docs/STATUS-SERVICE.md)

## Running without Supervisor

Invoke `node src/server.js`.

To run it in the background:

```bash
sudo nohup node src/server.js &
```

On production systems, SSL certificates are typically readable only by root. Start the server with `sudo` so Node can access the key files.

## Dealing with port 80 and file permissions

```bash
sudo setcap 'cap_net_bind_service=+ep' $(which node)
```

## Logging

The application logs to stdout using Winston. Adjust verbosity with the `LOG_LEVEL` environment variable.

## Linting

```bash
npm run lint
```

## Testing

Run the test suite with Node's built-in test runner:

```bash
npm test
```

To enforce 80% line and function coverage with [c8](https://github.com/bcoe/c8):

```bash
npm run coverage
```

The test suite also renders each EJS view to verify templates compile. If you add a template that requires locals, extend the sample-data map in [`test/views.test.js`](test/views.test.js) with representative values.

To profile slow tests and log durations:

```bash
npm run test:profile
```

Results are written to `tmp/slow-tests.log`.

## Contributing

Run `npm run lint` and `npm test` before committing. Coverage must remain at or above 80%.
