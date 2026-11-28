# Maintenance Notes

## Knip Suppressions

`knip.json` suppresses a small set of export findings that are intentional test seams or browser entry surfaces:

- `src/client/core/preferences.js`, `src/client/core/store.js`, `src/client/features/terminal/buttons.js`, and `src/client/core/bootstrap.js` expose setup functions used by tests to keep browser-global behavior injectable.
- `src/controllers/socket.js` exports socket helpers so route tests can exercise address, logging, and connection behavior without opening the full Socket.IO server.
- `src/middleware/error.js` exports middleware helpers for direct error-path coverage.
- `package.json` binary findings are suppressed because package-provided CLIs are invoked by scripts rather than imported from application code.

When adding a new suppression, document whether it is a test seam, runtime entry point, or tool limitation. Remove the suppression when the export becomes private or Knip can see the usage.


## Compatibility and generated files

- The main terminal uses virtual output when the workspace is present. The
  legacy renderer remains for hosts without it. Changes to output parsing
  should cover both entry paths while they are supported.
- Browser bundles, Ace, parser WebAssembly, and generated CSS are built output.
  The parser worker imports the tree-sitter runtime at its served URL, which
  the build copies into place. Knip intentionally ignores that one URL.
- Keep the [architecture guide](ARCHITECTURE.md) current when moving ownership
  between entrypoints, services, and features. Record any new compatibility
  paths and the condition under which they can be removed.


## Dependency updates

Keep browser and server pairs together when updating React and React DOM or
Socket.IO and its client. After a clean install, run the build, Node suite,
coverage, lint, dead-code check, and both desktop browser projects. Check
Playwright's browser revisions after upgrading the runner.

Review dependency engine requirements, including transitive development tools,
before adopting a major release. Tailwind 4 also changes the browser minimum and
CSS pipeline. UAParser.js 2 changes its license terms. Treat changes to those
requirements as separate decisions.
