/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import { test } from "node:test";
import assert from "node:assert/strict";

function createServerConfig() {
  return {
    node: {
      port: 0,
      ip: "127.0.0.1"
    },
    ssl: null,
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
  const initialListeners = process.listenerCount("uncaughtException");

  moduleMock("../../src/config/index.js", { defaultExport: createServerConfig() });
  moduleMock("../../src/logger.js", {
    defaultExport: { info() {}, warn() {}, error() {}, debug() {} },
    namedExports: {
      inspect() {},
      named: () => ({ info() {}, warn() {}, error() {}, debug() {} })
    }
  });
  moduleMock("../../src/services/build.js", { defaultExport: async () => {} });
  moduleMock("../../src/routes/index.js", { defaultExport: {} });
  moduleMock("../../src/controllers/socket.js", {
    namedExports: {
      connection() {},
      error() {}
    }
  });
  moduleMock("../../src/server/app.js", {
    namedExports: {
      createApp: () => ({
        get: () => "test"
      })
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
  assert.equal(process.listenerCount("uncaughtException"), initialListeners);

  await serverModule.start({ skipBuild: true });
  assert.equal(bindCalls, 1);
  assert.equal(process.listenerCount("uncaughtException"), initialListeners + 1);

  await serverModule.start({ skipBuild: true });
  assert.equal(bindCalls, 1);
  assert.equal(process.listenerCount("uncaughtException"), initialListeners + 1);

  await serverModule.stop();
  assert.equal(process.listenerCount("uncaughtException"), initialListeners);
});
