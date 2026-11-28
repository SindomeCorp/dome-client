# Dome Client architecture

Dome Client is a Node application that serves the browser UI and bridges each
Socket.IO connection to a TCP or TLS game connection. The game owns login,
character state, and command authorization. The client owns presentation, local
preferences, and interpretation of supported control messages.

| Area | Entry point and ownership |
| --- | --- |
| Server lifecycle | [src/server.js](../src/server.js) builds assets, starts HTTP and optional HTTPS, and owns the status poller's lifetime. [src/server/](../src/server/) assembles Express and Socket.IO. |
| HTTP and game connections | [Routes](../src/routes/index.js) delegate to controllers. [Services](../src/services/) own the transport, external polls, and file access without depending on Express. |
| Browser startup | [Client entrypoints](../src/client/entrypoints/) compose page behavior. [Browser core](../src/client/core/) initializes the player client and adapts browser state and native bridges. |
| Terminal | [Terminal modules](../src/client/features/terminal/) receive socket events, parse control lines, and decode ANSI. The output parser owns the transport generation used to discard stale queued data. |
| Output and menus | [Output windows](../src/client/features/output-windows/) own retained history, routing, and mounted views. [Context menus](../src/client/features/context-menus/) consume rendered output and own their separate profile session. |
| Editor | [Editor modules](../src/client/features/editor/) own popup integration, Ace, and the React IDE. See the [IDE lifecycle](ide-editor.md#window-lifecycle). |
| Shared configuration | [Shared modules](../src/shared/) contain schemas and pure helpers used on both sides. They should stay independent of Node-only and DOM APIs. |
| Generated assets | The [entry manifest](../src/services/browser-entry-manifest.js) maps sources to browser bundles. The build generates JS and CSS, copies Ace and the parser runtime, then publishes them under `public/`. Edit LESS or source CSS rather than generated files. |

Use production entrypoints to attach listeners and start services. Keep reusable
state and logic in core or feature modules so importing them does not initialize
a page. Owners should release timers, listeners, workers, and pop-out bindings
when the associated service or view ends. Keep asynchronous work tied to its
connection or configuration generation when a late result could change state.

For changes to game messages, start with the [protocol guide](SDWC-OOB.md). For
output and selection, see [Output Windows](OUTPUT-WINDOWS.md). The
[Testing Guide](TESTING.md) explains which fixtures use real browser bundles.
