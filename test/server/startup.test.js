/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { setImmediate } from "node:timers/promises";

function createServerConfig() {
  return {
    node: {
      port: 0,
      ip: "127.0.0.1"
    },
    ssl: null,
    status: { serviceUrl: "" },
    autocomplete: {
      enabled: false,
      p: "data/autocomplete/player.txt"
    }
  };
}

const packagePath = fileURLToPath(new URL("../../package.json", import.meta.url));
let revision = 0;

function mockStartup(t, { ssl = null, build = t.mock.fn(async () => {}) } = {}) {
  const moduleMock = typeof t.mock.module === "function"
    ? t.mock.module.bind(t.mock)
    : t.mock.import.bind(t.mock);
  let bindCalls = 0;
  const startPolling = t.mock.fn();
  const stopPolling = t.mock.fn();
  const appVersion = process.env.APP_VERSION;
  delete process.env.APP_VERSION;
  t.after(() => {
    if (appVersion === undefined) delete process.env.APP_VERSION;
    else process.env.APP_VERSION = appVersion;
  });
  const createApp = t.mock.fn(() => ({ get: (key) => key === "version" ? "test" : undefined }));
  const readAutocomplete = t.mock.method(fs.promises, "readFile");
  const logger = { info: t.mock.fn(), warn: t.mock.fn(), error: t.mock.fn(), debug: t.mock.fn() };
  const named = t.mock.fn(() => logger);
  const listeners = new Set(process.listeners("uncaughtException"));
  t.after(() => {
    for (const listener of process.listeners("uncaughtException")) {
      if (!listeners.has(listener)) process.removeListener("uncaughtException", listener);
    }
  });

  const load = () => import(`../../src/server.js?startup=${revision++}`);

  const httpServer = {};
  const sslServer = ssl ? {} : null;
  const listen = t.mock.fn(async (server) => {
    assert.ok(server, "cannot listen without a server");
  });
  const config = { ...createServerConfig(), ssl, security: { ipBlocklistPath: "fixture-ip-list" } };
  const loadIpBlocklist = t.mock.fn(() => ({ has: () => false }));
  moduleMock("../../src/config/index.js", { defaultExport: config });
  moduleMock("../../src/services/ip-blocklist.js", { namedExports: { loadIpBlocklist } });
  moduleMock("../../src/logger.js", {
    defaultExport: { info() {}, warn() {}, error() {}, debug() {} },
    namedExports: {
      inspect() {},
      named
    }
  });
  moduleMock("../../src/services/build.js", { defaultExport: build });
  moduleMock("../../src/routes/index.js", { defaultExport: {} });
  moduleMock("../../src/controllers/status.js", {
    namedExports: { startStatusPolling: startPolling, stopStatusPolling: stopPolling }
  });
  moduleMock("../../src/controllers/socket.js", {
    namedExports: {
      connection() {},
      error() {}
    }
  });
  moduleMock("../../src/server/app.js", {
    namedExports: {
      createApp
    }
  });
  moduleMock("../../src/server/servers.js", {
    namedExports: {
      createHttpServers: () => ({
        server: httpServer,
        httpMgr: {},
        sslServer,
        httpsMgr: null
      })
    }
  });
  moduleMock("../../src/server/lifecycle.js", {
    namedExports: {
      close: async () => {},
      listen,
      resolveBoundAddress: () => ({ address: "127.0.0.1", port: 0 })
    }
  });
  moduleMock("../../src/server/socket-managers.js", {
    namedExports: {
      bindSocketManagers: () => {
        bindCalls++;
      }
    }
  });

  return {
    load, createApp, logger, named, build, readAutocomplete, startPolling, stopPolling,
    loadIpBlocklist, httpServer, sslServer, listen, getBindCalls: () => bindCalls
  };
}

test("importing server does not bind sockets or process exception listeners", async (t) => {
  const { load, createApp, named, build, readAutocomplete, startPolling, stopPolling, getBindCalls, listen, httpServer } = mockStartup(t);
  const initialListeners = process.listenerCount("uncaughtException");
  const serverModule = await load();

  assert.equal(getBindCalls(), 0);
  assert.equal(startPolling.mock.callCount(), 0);
  const [appOptions] = createApp.mock.calls[0].arguments;
  assert.equal(appOptions.appVersion, JSON.parse(fs.readFileSync(packagePath, "utf8")).version);
  assert.equal(appOptions.versionHash, process.env.GIT_HASH);
  assert.ok(appOptions.appStartTime instanceof Date);
  assert.ok(named.mock.calls.some(({ arguments: [namespace] }) => namespace === "client-app"));
  assert.equal(process.listenerCount("uncaughtException"), initialListeners);

  await serverModule.start({ skipBuild: true });
  assert.equal(getBindCalls(), 1);
  assert.equal(startPolling.mock.callCount(), 1);
  assert.deepEqual(listen.mock.calls.map(({ arguments: args }) => args), [[httpServer, 0, "127.0.0.1"]]);
  assert.equal(build.mock.callCount(), 0);
  assert.ok(!readAutocomplete.mock.calls.some(({ arguments: [file] }) => file === "data/autocomplete/player.txt"));
  assert.equal(process.listenerCount("uncaughtException"), initialListeners + 1);

  await serverModule.start({ skipBuild: true });
  assert.equal(getBindCalls(), 1);
  assert.equal(process.listenerCount("uncaughtException"), initialListeners + 1);

  await serverModule.stop();
  assert.equal(stopPolling.mock.callCount(), 1);
  assert.equal(process.listenerCount("uncaughtException"), initialListeners);

  await serverModule.start();
  assert.equal(build.mock.callCount(), 1);
  assert.equal(process.listenerCount("uncaughtException"), initialListeners + 1);
  await serverModule.stop();
  assert.equal(process.listenerCount("uncaughtException"), initialListeners);
});

test("startup exposes fallback version metadata and wires the configured blocklist", async (t) => {
  const previousHash = process.env.GIT_HASH;
  delete process.env.GIT_HASH;
  t.after(() => {
    if (previousHash === undefined) delete process.env.GIT_HASH;
    else process.env.GIT_HASH = previousHash;
  });
  const { load, createApp, loadIpBlocklist, logger } = mockStartup(t);
  const read = fs.readFileSync.bind(fs);
  let metadata = "{}";
  t.mock.method(fs, "readFileSync", (file, options) => {
    if (file !== packagePath) return read(file, options);
    return metadata;
  });

  for (const value of ["{}", "null", "invalid JSON"]) {
    metadata = value;
    await load();
    const [options] = createApp.mock.calls.at(-1).arguments;
    assert.equal(options.appVersion, "0.0.0");
    assert.match(options.versionHash, /^t[0-9]+$/);
    assert.equal(options.ipBlocklist, loadIpBlocklist.mock.calls.at(-1).result);
  }
  assert.deepEqual(loadIpBlocklist.mock.calls[0].arguments, [{ filePath: "fixture-ip-list", fs, logger }]);
});

test("startup reports both listening ports and logs uncaught exceptions", async (t) => {
  const { load, logger, listen, httpServer, sslServer } = mockStartup(t, { ssl: { port: 8443 } });
  const before = new Set(process.listeners("uncaughtException"));
  const server = await load();
  await server.start({ port: 8080, ip: "127.0.0.1", skipBuild: true });
  await server.start({ port: 8081, ip: "", httpsPort: 8444, skipBuild: true });
  assert.deepEqual(listen.mock.calls.map(({ arguments: args }) => args), [
    [httpServer, 8080, "127.0.0.1"],
    [sslServer, 8443, "127.0.0.1"],
    [httpServer, 8081],
    [sslServer, 8444]
  ]);
  const banner = "dome-client.js vtest (node " + process.version + ") listening";
  assert.deepEqual(logger.info.mock.calls.map(({ arguments: args }) => args), [
    [banner + " on ip 127.0.0.1 and port 8080"],
    [banner + " on ip 127.0.0.1 and port 8443"],
    [banner + " on port 8081"],
    [banner + " on port 8444"]
  ]);

  const failure = new Error("fixture uncaught exception");
  const listener = process.listeners("uncaughtException").find(candidate => !before.has(candidate));
  listener(failure);
  assert.deepEqual(logger.error.mock.calls[0].arguments, ["uncaught exception", failure]);
  await server.stop();
});

test("the direct startup entry logs a build failure and shuts down with a failure exit code", async (t) => {
  const failure = new Error("fixture startup failure");
  const build = t.mock.fn(async () => { throw failure; });
  const { load, logger, stopPolling, getBindCalls } = mockStartup(t, { build });
  const previousArg = process.argv[1];
  const previousExitCode = process.exitCode;
  t.after(() => {
    process.argv[1] = previousArg;
    process.exitCode = previousExitCode;
  });
  process.argv[1] = fileURLToPath(new URL("../../src/server.js", import.meta.url));

  await load();
  await setImmediate();

  assert.equal(build.mock.callCount(), 1);
  assert.equal(getBindCalls(), 0);
  assert.deepEqual(logger.error.mock.calls[0].arguments, ["Server startup failed", failure]);
  assert.equal(stopPolling.mock.callCount(), 1);
  assert.equal(process.exitCode, 1);
});
