const playerClientEntries = [
  {
    entry: "index.js",
    file: "player-client.js",
    format: "iife",
    minify: false
  },
  {
    entry: "index.js",
    file: "player-client.min.js",
    format: "iife",
    minify: true
  }
];

const pageEntries = [
  { entry: "client-connect.js", file: "client-connect.js", external: ["./logger.js"] },
  { entry: "client-options.js", file: "client-options.js", external: ["./logger.js"] },
  { entry: "editor-window.js", file: "editor-window.js", external: ["./logger.js"] },
  { entry: "note-editor-window.js", file: "note-editor-window.js", external: [] },
  { entry: "logger.js", file: "logger.js", external: [] },
  { entry: "ide-editor-window.jsx", file: "ide-editor-window.js", external: ["./logger.js"] },
  { entry: "moo-parser-worker.js", file: "moo-parser-worker.js", external: ["/js/parsers/web-tree-sitter.js"] }
];

const browserOutputFiles = [
  ...playerClientEntries.map(({ file }) => file),
  ...pageEntries.map(({ file }) => file)
];

export {
  browserOutputFiles,
  pageEntries,
  playerClientEntries
};
