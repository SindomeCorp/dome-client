# Ace Integration Notes

This project bundles Ace v1.43.2.

## Directories

- `public/js/ace` – upstream Ace build used by the client (208 files)
  - provides the core `ace.js` editor
  - 142 language modes as `mode-*.js`
  - 34 themes as `theme-*.js`
  - 19 extensions as `ext-*.js`
  - 2 keybinding modules as `keybinding-*.js`
  - 9 web workers as `worker-*.js`
  - `snippets/` folder with 142 snippet files for code templates
- `src/client/ace` – project-specific modules bundled with the client
  - `keybinding-vim.js` adjusts the Vim keymap and retains multi-cursor support
  - `mode-moo.js` adds syntax highlighting, indentation, and linting support for the MOO language

## Differences from upstream

### keybinding-vim.js

Adds two "jk" mappings:

- "jk" exits insert mode as `<Esc>`.
- "jk" acts as `j` when typed in sequence.

The module also requires `ace/commands/multi_select_commands` and `ace/multi_select` to enable multi-cursor operations.

### mode-moo.js

This mode is not present in upstream Ace. The project version:

- defines `MOOHighlightRules` covering keywords, built-ins, and functions
- implements comment toggling and indentation rules; the background worker is disabled to avoid loading `moo_worker`

## Customizing modules

1. Add new files under `src/client/ace/`.
2. Import them from the relevant page script such as `src/client/pages/editor-window.js`.
3. Run `npm start` or `npm run build` to copy the Ace distribution and bundle the new modules.

