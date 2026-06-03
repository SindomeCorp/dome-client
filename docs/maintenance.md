# Maintenance Notes

## Knip Suppressions

`knip.json` suppresses a small set of export findings that are intentional test seams or browser entry surfaces:

- `src/client/c-preferences.js`, `src/client/store.js`, `src/client/u-buttons.js`, and `src/client/z-setup.js` expose setup functions used by tests to keep browser-global behavior injectable.
- `src/controllers/socket.js` exports socket helpers so route tests can exercise address, logging, and connection behavior without opening the full Socket.IO server.
- `src/middleware/error.js` exports middleware helpers for direct error-path coverage.
- `package.json` binary findings are suppressed because package-provided CLIs are invoked by scripts rather than imported from application code.

When adding a new suppression, document whether it is a test seam, runtime entry point, or tool limitation. Remove the suppression when the export becomes private or Knip can see the usage.
