# Changelog

All notable changes to this project will be documented in this file.

## 2026-05-27

### Added
- Added ANSI TrueColor rendering support for foreground/background sequences (`38;2;r;g;b` and `48;2;r;g;b`) using inline RGB styles in the line buffer and saved logs.
- Added a `Scroll Up to Pause` client option that pauses auto-scroll when you scroll up and resumes when you return to the bottom.

### Changed
- Renamed the `SDWC No-Wrap Blocks` client option to `Mobile Friendly Text Wrap` for clearer user-facing wording.
- Updated the main client command input to request plain text mobile keyboards without autocapitalize, autocomplete, or autocorrect.
- Organized Client Options into General, Fonts, and Local Editor tabs, renamed `Output Colors` to `Theme`, and removed admin-only wording from editor options.

### Fixed
- Preserved existing xterm256 class-based color mapping behavior while adding TrueColor, so client color schemes continue overriding palette-based colors as before.
- Fixed ANSI rendering for SGR reset/toggle sequences (`22m`, `25m`, `7m`, `27m`) so bold/blink/inverse styles stop correctly and raw escape codes are no longer shown in output.
- Replaced regex ANSI rendering with a stateful stream parser so SGR resets, inverse fg/bg swapping, xterm256 themed colors, TrueColor, and split escape sequences render consistently with terminal behavior.
- Updated default-color inverse rendering to use explicit inverse foreground/background colors (instead of CSS filter inversion) for closer terminal visual parity.
- Fixed `Scroll Up to Pause` so enabling or disabling it from Client Options takes effect immediately without requiring a reload.
- Fixed the `Transparent Overlays` option so autocomplete overlays keep the selected transparency when toggled or rebuilt.

## 2026-05-22

### Added
- Added a new client option, `SDWC No-Wrap Blocks` (default off), to enable horizontal-scroll rendering for explicit SDWC nowrap marker regions.

### Changed
- Added support for server OOB markers `#$# SDWC-START-NOWRAP` and `#$# SDWC-END-NOWRAP` so marked output streams into a dedicated no-wrap horizontal-scroll block while preserving per-line styling.
- Updated log/export styling parity so SDWC nowrap blocks retain their horizontal-scroll presentation in rendered output.
## 2026-05-21

### Added
- Added local glyphicon sprite assets (`public/img/glyphicons-halflings.png` and `public/img/glyphicons-halflings-white.png`) to remove runtime dependency on remote icon images.
- Added a `Ctrl+R` command-history search overlay with live filtering, keyboard navigation, and click-to-select support that inserts the chosen command back into the input buffer.
- Added a new client option to choose log export style between default inline CSS and legacy linked `https://sindome.org/css/dome.css` output.

### Changed
- Migrated legacy dome utility/button/icon styles into the LESS source and bundled them in `/css/client.css`, replacing runtime dependency on remote `https://sindome.org/css/dome.css`.
- Updated HTML log export to inline the client stylesheet directly in downloaded log files so session logs no longer depend on Sindome-hosted CSS.
- Updated keyboard shortcut help to document `Ctrl+R` command-history search.
- Updated command-history search results so the active selection uses the client blue highlight with high-contrast white text, auto-scrolls into view during keyboard navigation, and expands to show full wrapped command text.

### Fixed
- Prevented mobile connect-page horizontal overflow so the main auth panel, Website Login box, guest actions, and footer no longer bleed off the screen on small viewports.
- Restored responsive visibility utility classes (`hidden-xs`/`hidden-sm`/`hidden-md`/`hidden-lg`) so player-client top controls collapse back to glyph-only labels on small screens.
- Fixed real-device mobile styling mismatch by serving local `client.css` for all device types and removing runtime dependency on external `dome.css`.
- Fixed exported HTML log typography fallback so buffer text stays monospace when `Source Code Pro` is unavailable offline.
- Restored base legacy UI styling (`.btn`, `.hidden`, `.close`) in bundled client styles so connect-page buttons and the Chrome performance warning render correctly without remote `dome.css`.
- Aligned extracted legacy global/link/button/title styles with Sindome’s `dome.css` so connect-page buttons, heading color, and version/changelog link colors match expected appearance more closely.
- Restored explicit terminal font styling for `#inputBuffer` so command entry text matches the expected in-game monospace appearance.
- Restored the input buffer top separator border to prevent visual clipping/offset at the bottom edge and match legacy `dome.css` behavior.
- Corrected input buffer edge styling by removing the thicker top separator and restoring bottom spacing so the bottom line remains visible without increasing top border thickness.
- Added mobile-only up/down history buttons beside the input box that trigger the same command-history navigation behavior as keyboard arrow keys.
- Fixed mobile history button behavior in multiline input so caret navigation now matches arrow-key behavior before history recall triggers.
- Increased small-screen input box height beside mobile history buttons so the textarea fills the control column height without leaving dead space.
- Filtered exact duplicate entries from command-history search results so repeated identical commands appear once.
- Corrected history-search overlay/input sizing so the search field no longer expands beyond modal edges on smaller screens.

### Removed
- Removed unused `WEBSITE_BASE` environment variable from env validation, app config wiring, server template locals, and env example files.

## 2026-05-19

### Changed
- Bumped displayed client version to `4.0.1` so the footer and server startup version match `package.json`.
- Updated app version wiring to use `APP_VERSION` first, then `package.json` version, with a final fallback to `0.0.0`.
- Unified client stylesheet loading to always use `/css/client.css` across desktop, phone, and tablet requests.

### Fixed
- Reduced IDE toolbar button sizing and enabled responsive wrapping so top-row controls and editor content remain visible at the default non-maximized window size.
- Restored `npm run build` behavior by making the build script execute the asset pipeline when run directly.
- Re-centered IDE tab close buttons so the `×` icon stays visually centered within each tab.
- Added a global `window.DomeBridge` ingress API so mobile native bridge integrations can route inbound game data through the standard client parser and retain color/format rendering.
- Enabled mobile native bridge log downloads by sending generated HTML logs through `window.DomeNative.downloadLog` when available, with browser download fallback retained.
- Added native-bridge socket shimming in the client bootstrap so mobile wrappers with `window.DomeNative` can run transport through the native bridge instead of initializing browser Socket.IO.
- Buffered native bridge startup events until `window.DomeBridge` is ready, then flushed queued data so initial MOO splash output is not dropped on app load.
- Added an explicit native `bridgeReady` handshake so Android can hold and replay pre-init socket payloads that arrive before page scripts are ready.

### Changed
- Switched IDE top-bar theme, wrap, and tab-orientation controls to compact icon/glyph buttons with tooltips to improve fit at smaller window sizes.
- Changed the IDE shortcuts control to a compact glyph button and reduced tab button padding so more tabs fit comfortably in the tab strip.
- Made the IDE shortcuts modal responsive at smaller/zoomed window sizes by reducing typography scale and adding internal scroll handling.
- Reworked IDE toolbar responsiveness so controls/status/save/close stay on the first row at smaller sizes, with the editing context line moved to a centered second row.
- Removed small-screen toolbar horizontal scrolling, tightened mobile control sizing, and shortened `View Saved Scratch` to `View Scratch` for better fit.
- Shifted IDE toolbar responsive breakpoint to `md` so 640px stays in two-row mode, keeping the editing label visible below controls while further reducing mobile button sizing.

## 2026-05-18

### Added
- Added global autocomplete feature toggle (`AUTOCOMPLETE_ENABLED`) with default-off behavior and dedicated setup documentation (`docs/AUTOCOMPLETE.md`).

### Changed
- Renamed IDE window title branding to `Dome-Client Developer IDE [tab-count]`.
- Updated runtime defaults to be more generic by setting `WEBSITE_BASE` and `SHORTEN_DOMAIN` defaults to empty values.
- Updated `.env` example files to reflect new defaults and include autocomplete toggle guidance.
- Expanded and aligned setup documentation across README and `docs/` for autocomplete, URL shortener, and website auth behavior.

### Fixed
- Prevented website-login crashes when remote auth returns null entries in `user.chars` by filtering invalid characters before session storage and rendering.
- Reduced excess empty space in the logged-in "Play As ..." panel by removing fixed desktop minimum height so the box fits its content.

### Removed
- Removed the non-functional lock/unlock toggle from the logged-in "Play As ..." section.
- Removed outdated internal UI polish scratch doc (`docs/UI-POLISH.md`) to keep release docs focused on active features and operator setup.

## 2026-02-17

### Added
- Added a configurable 20-line IDE limit for `@local-save-note`.

## 2026-01-08

### Added
- Configurable line limits for `@local-save-node` and `@local-save-node-admin` in the IDE editor.

## 2026-01-07

### Added
- Prompt before closing the tab or window when the socket is still connected.

## 2025-12-21

### Added
- Prime the alert tone on first interaction so autoplay restrictions don't block chimes.

### Fixed
- Treat mention chimes as case-insensitive.

## 2025-10-12

### Added
- SSL ACME check route.

## 2025-09-30

### Changed
- Updated health overlay timestamps to display in the browser's local time zone instead of UTC.
- Added an optional UTC mode to the client date formatter to keep tests deterministic while defaulting UI to local time.

## 2025-09-21
- Made log downloading a fully local thing, so that it doesn't hit the server (better if the server goes down, and won't overload the server on large logs)

## 2025-09-18
- Fixed double scrollbar issue in FireFox
- Added health check
  
## 2025-09-04
- Updated health check to have a higher ceiling for available ram
- Fixed bug with command suggestions being off causing console errors

## 2025-09-02
- Fixed a bug where you'd get reconnected while on the @quit disconnect screen
- Added a view saved scratch button to the admin editor

## 2025-08-31

### Added
- Configurable shorten request timeout.
- Changelog link on the client connect page.
- Ability to send empty input commands.
- Button and Ctrl+Shift+L shortcut to toggle word wrap across all IDE tabs.

### Changed
- Simplified connect flow by removing the options button and streamlining the URL.
- Updated ACE print margin to 120 characters.
- Silenced healthcheck logs.
- Added bottom padding to the buffer.
- Improved health overlay behavior to close on mouse exit, delay hiding, and prevent flicker.
- Documented sudo requirement for SSL key access.

### Fixed
- Preferences store initialization issue.
- Buffer parser now merges split tokens and UUID lines and treats color-only lines as blank.
- IDE windows now reuse existing window.
- Tab orientation controls remain visible on narrow screens.
- Word wrap toggle now keeps all IDE tabs in sync and refreshes inactive tabs immediately.
- Fixed double scrollbar
- Fixed text wrapping / new line issue due to TCP sockets

## 2025-08-30

### Added
- Scratch pad tab support in the IDE.

### Changed
- Refactored command utilities and labels, including @@set_note targets, upload command labels, and unique tab keys.
- Expanded IDE shortcuts overlay and table layout; increased column spacing and cell expansion.
- Log full editor and command context when opening the IDE.

### Fixed
- Handle `none` values and missing Ace workers.
- Notify users when switching to an existing IDE tab.

## 2025-08-29

### Added
- Basic editor for non-program commands with Ace text mode.
- IDE shortcuts overlay with slash toggle, bracket navigation, and tab-switching shortcuts.
- Configurable editor and output fonts, including Comic Mono.
- Close button and keyboard shortcuts for closing IDE tabs; vertical tab scrolling.
- Reuse existing IDE window and update IDE title with tab count.

### Changed
- Applied Ace theme colors and output font styling across editors.
- Bumped webclient version to 4.0.
- Reworked overlay placement and tab resizing; applied theme to basic editor.

### Fixed
- Prevent browser window from closing via Ctrl/Cmd+W and refine unsaved-change warning.
- Display save controls only when upload targets exist.
- Apply dark theme to document root and remove nested buttons in the IDE editor.

## 2025-08-28

### Changed
- Simplified reconnect button logic.
- Image preview toggle persists across sessions.

### Removed
- Unused "Close All Windows" button.

## 2025-08-27

### Added
- Integrated Ace editor into note editor and upgraded to v1.43.2.
- Introduced native command suggestions and expanded preference management with persistent font, theme, and color options.
- Replaced help menu with an options button and removed channel windows and god mode options.

### Changed
- Migrated dependencies to modern alternatives and bundled UI dependencies locally.
- Hardened path handling, WHO content-length calculation, and log filename sanitization.

### Fixed
- Fixed console.log errors when client loads in browser.
- Resolved echo/hide echo button sync issues.

## 2025-08-26

### Changed
- Replaced remaining jQuery and underscore usage with native DOM APIs.
- Removed obsolete script and stylesheet references from headers.
- Redesigned help menu and overlay toggles using custom JavaScript.
- Migrated animations to CSS/Web Animations and server calls to `fetch`.

### Fixed
- Fixed disconnect overlay class usage and other UI glitches.

## 2025-08-25

### Added
- In-app shortcuts overlay button.
- Browser logger to replace direct console calls.
- DNS error handler for socket utilities and `writeAsync` promise wrapper.

### Changed
- Updated command history behavior.
- Moved keybinding from End to Pause/Break.
- Modernized dependencies, build pipeline, and client module structure.
- Converted login and URL-shortening logic to async/await with `fetch`.
- Consolidated log-file naming and reduced extraneous status logs.

### Fixed
- Guest login no longer persists after manual reconnect.
- Corrected pause key mapping and up-arrow navigation glitches.
- Copying buffer window no longer adds extra line breaks.
- Localized preference variables to avoid global leaks.

### Removed
- Unused JavaScript dependencies and obsolete session keys, special options, and deprecated configuration flags.
- Legacy script tags (Backbone, CryptoJS, JSON2) and simplified environment setup.
