/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

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

test("importing server does not bind sockets or process exception listeners", async (t) => {
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
  const readVersion = () => JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;
  const createApp = t.mock.fn(() => ({ get: () => "test" }));
  const build = t.mock.fn(async () => {});
  const readAutocomplete = t.mock.method(fs.promises, "readFile");
  const named = t.mock.fn(() => ({ info() {}, warn() {}, error() {}, debug() {} }));
  const initialListeners = process.listenerCount("uncaughtException");

  moduleMock("../../src/config/index.js", { defaultExport: createServerConfig() });
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
        server: {},
        httpMgr: {},
        sslServer: null,
        httpsMgr: null
      })
    }
  });
  moduleMock("../../src/server/lifecycle.js", {
    namedExports: {
      close: async () => {},
      listen: async () => {},
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

  const serverModule = await import(`../../src/server.js?startup=${Date.now()}`);

  assert.equal(bindCalls, 0);
  assert.equal(startPolling.mock.callCount(), 0);
  const [appOptions] = createApp.mock.calls[0].arguments;
  assert.equal(appOptions.appVersion, readVersion());
  assert.equal(appOptions.versionHash, process.env.GIT_HASH);
  assert.ok(appOptions.appStartTime instanceof Date);
  assert.ok(named.mock.calls.some(({ arguments: [namespace] }) => namespace === "client-app"));
  assert.equal(process.listenerCount("uncaughtException"), initialListeners);

  await serverModule.start({ skipBuild: true });
  assert.equal(bindCalls, 1);
  assert.equal(startPolling.mock.callCount(), 1);
  assert.equal(build.mock.callCount(), 0);
  assert.ok(!readAutocomplete.mock.calls.some(({ arguments: [file] }) => file === "data/autocomplete/player.txt"));
  assert.equal(process.listenerCount("uncaughtException"), initialListeners + 1);

  await serverModule.start({ skipBuild: true });
  assert.equal(bindCalls, 1);
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
