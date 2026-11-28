import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const areas = {
  "server": {
    mutate: [
      "src/server.js", "src/env.js", "src/logger.js", "src/config/**/*.js", "src/server/**/*.js",
      "src/routes/**/*.js", "src/middleware/**/*.js", "src/controllers/{autocomplete,health,screens,session-error}.js",
      "src/services/{browser-entry-manifest,build,ip-blocklist,log-export-style,shorten,status-poller,ua}.js"
    ],
    tests: [
      "test/config/*.test.js", "test/middleware/*.test.js", "test/views/*.test.js",
      "test/server/client-app*.test.js", "test/server/logger.test.js", "test/server/startup.test.js",
      "test/routes/autocomplete.test.js", "test/routes/health.test.js", "test/routes/screens.test.js",
      "test/routes/session-error.test.js", "test/routes/status.test.js", "test/services/build*.test.js",
      "test/services/ip-blocklist.test.js", "test/services/log-export-style.test.js", "test/services/shorten.test.js",
      "test/services/status-poller.test.js",
      "test/services/ua.test.js", "test/integration/server-*.integration.js", "test/integration/status-host-normalization.integration.js"
    ]
  },
  "protocol": {
    mutate: [
      "src/controllers/telnet-iac.js", "src/services/{mud-connection,socket-*,telnet-iac-processor}.js",
      "src/client/features/terminal/{socket-lifecycle,socket-output-protocol}.js"
    ],
    tests: [
      "test/services/mud-connection.test.js", "test/services/socket-*.test.js", "test/services/telnet-iac-processor.test.js",
      "test/routes/socket.test.js", "test/integration/socket-*.integration.js",
      "test/client/socket-lifecycle.test.js", "test/client/socket-output-protocol.test.js"
    ]
  },
  "context-menus": {
    mutate: [
      "src/client/features/context-menus/**/*.js", "src/client/entrypoints/context-menus-worker.js",
      "src/shared/context-menu*.js", "src/services/context-menu-profile*.js"
    ],
    tests: ["test/client/context-menu*.test.js", "test/server/context-menu*.test.js"]
  },
  "output-windows": {
    mutate: [
      "src/client/features/output-windows/**/*.js", "src/client/entrypoints/{output-window,output-rules-worker}.js",
      "src/shared/output-windows.js", "src/services/output-window-presets.js"
    ],
    tests: ["test/client/output-*.test.js", "test/client/log-download.test.js", "test/services/output-window-presets.test.js"]
  },
  "terminal": {
    mutate: [
      "src/client/features/terminal/**/*.js",
      "!src/client/features/terminal/{socket-lifecycle,socket-output-protocol}.js",
      "src/shared/log-template.js"
    ],
    tests: [
      "test/client/autocomplete.test.js", "test/client/autoscroll.test.js", "test/client/button*.test.js",
      "test/client/chevron-toggle.test.js", "test/client/d-inputreader.test.js", "test/client/f-buffer.test.js",
      "test/client/history-search-overlay.test.js", "test/client/image-preview.test.js", "test/client/input-*.test.js",
      "test/client/log-download.test.js", "test/client/media-url.test.js", "test/client/replacements.test.js",
      "test/client/socket-output-effects.test.js", "test/client/socket-output-renderer.test.js",
      "test/client/transparent-overlay.test.js", "test/client/window-handlers.test.js", "test/shared/log-template.test.js"
    ]
  },
  "editor": {
    mutate: [
      "src/client/features/editor/**/*.{js,jsx}", "!src/client/features/editor/ace/mode-moo.js",
      "src/client/entrypoints/{editor-window,note-editor-window,moo-parser-worker}.js",
      "src/client/entrypoints/ide-editor-window.jsx"
    ],
    tests: [
      "test/client/editor-*.test.js", "test/client/ide*.test.js", "test/client/mode-moo.test.js",
      "test/client/moo-*.test.js", "test/client/note-editor-window.test.js"
    ]
  },
  "options": {
    mutate: [
      "src/client/features/options/**/*.js", "src/client/entrypoints/{client-options,ejs-scripts/master-header}.js",
      "src/shared/client-options.js"
    ],
    tests: ["test/client/client-option*.test.js", "test/client/client-preference-dom.test.js", "test/client/preferences.test.js"]
  },
  "client-shell": {
    mutate: [
      "src/client/core/**/*.js", "src/client/entrypoints/{index,client-connect,logger}.js",
      "src/client/features/{connection,health}/**/*.js"
    ],
    tests: [
      "test/client/bar-graph.test.js", "test/client/client-composition.test.js", "test/client/client-connect*.test.js",
      "test/client/command-utils.test.js", "test/client/date-format.test.js", "test/client/health*.test.js",
      "test/client/logger.test.js", "test/client/native-bridge.test.js", "test/client/no-dome-singleton.test.js",
      "test/client/preferences.test.js", "test/client/saved-users-store.test.js", "test/client/setup*.test.js",
      "test/client/store.test.js", "test/client/variables.test.js"
    ]
  }
};

export function areaNames() {
  return Object.keys(areas);
}

export function getMutationArea(name) {
  if (!Object.hasOwn(areas, name)) {
    throw new Error(`Unknown mutation area "${name}". Choose ${areaNames().join(", ")}.`);
  }
  const { mutate, tests } = areas[name];
  return {
    mutate,
    commandRunner: {
      command: `NODE_ENV=test node --experimental-test-module-mocks --import=./test/mock-module.js --test ${tests.join(" ")}`
    },
    jsonReporter: { fileName: `reports/mutation/${name}.json` },
    incrementalFile: `reports/mutation/${name}.incremental.json`,
    tempDirName: `.stryker-tmp/${name}`,
    ignorePatterns: ["/.stryker-tmp", "/reports", "/tmp"]
  };
}

if (import.meta.main) {
  const { default: logger } = await import("../src/logger.js");
  try {
    const { positionals, values } = parseArgs({
      allowPositionals: true,
      options: {
        "dry-run": { type: "boolean" },
        force: { type: "boolean" },
        list: { type: "boolean" }
      }
    });
    if (values.list && positionals.length === 0) {
      logger.info(areaNames().join("\n"));
    } else {
      if (positionals.length !== 1 || values.list) {
        throw new Error("Usage: npm run test:mutation:area -- <area> [--dry-run] [--force], or use --list.");
      }
      const area = getMutationArea(positionals[0]);
      const { Stryker } = await import("@stryker-mutator/core");
      const base = JSON.parse(readFileSync(new URL("../stryker.conf.json", import.meta.url), "utf8"));
      await new Stryker({
        ...base,
        ...area,
        dryRunOnly: values["dry-run"] ?? false,
        force: values.force ?? false
      }).runMutationTest();
    }
  } catch (error) {
    logger.error(error.message);
    process.exitCode = 1;
  }
}
