# Changelog

All notable changes to this project will be documented in this file.

## 2026-05-21

### Added
- Added `public/css/dome-extract.css` to locally provide the legacy `dome.css` utility/button/alert/dropdown/icon styles still used by the client.
- Added local glyphicon sprite assets (`public/img/glyphicons-halflings.png` and `public/img/glyphicons-halflings-white.png`) to remove runtime dependency on remote icon images.

### Changed
- Updated the main layout stylesheet include to use local `/css/dome-extract.css` instead of loading remote `https://sindome.org/css/dome.css`.
- Migrated legacy dome utility/button/icon styles into the LESS source and bundled them in `/css/client.css`, removing the separate `/css/dome-extract.css` asset from runtime includes.
- Updated HTML log export to inline the client stylesheet directly in downloaded log files so session logs no longer depend on Sindome-hosted CSS.

### Fixed
- Fixed real-device mobile styling mismatch by serving local `client.css` for all device types and removing runtime dependency on external `dome.css`.
- Restored base legacy UI styling (`.btn`, `.hidden`, `.close`) in `dome-extract.css` so connect-page buttons and the Chrome performance warning render correctly without remote `dome.css`.
- Aligned extracted legacy global/link/button/title styles with Sindome’s `dome.css` so connect-page buttons, heading color, and version/changelog link colors match expected appearance more closely.
- Restored explicit terminal font styling for `#inputBuffer` so command entry text matches the expected in-game monospace appearance.
- Restored the input buffer top separator border to prevent visual clipping/offset at the bottom edge and match legacy `dome.css` behavior.
- Corrected input buffer edge styling by removing the thicker top separator and restoring bottom spacing so the bottom line remains visible without increasing top border thickness.

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
