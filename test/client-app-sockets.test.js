/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("socket handlers delegate and uncaught exceptions log", async (t) => {
  const config = {
    ssl: { key: "k", cert: "c", port: 1 },
    website: { base: "http://status.test" },
    shorten: { minimum: 50 },
    node: { session: { secret: "" }, socketUrl: "", socketUrlSSL: "", mode: "test", poweredBy: "", socketProxied: false },
    moo: { name: "" },
    heap: {},
    autocomplete: {},
  };
  t.mock.module("../src/config/index.js", { defaultExport: config });

  const errorLogs = [];
  const baseLogger = {
    info() {},
    error(msg, e) {
      errorLogs.push([msg, e]);
    },
    debug() {},
    child() {
      return this;
    },
  };
  t.mock.module("../src/logger.js", {
    defaultExport: baseLogger,
    namedExports: { named: () => baseLogger, inspect() {} },
  });

  const fsMock = {
    ...fs,
    readFileSync() {
      return "file";
    },
  };
  t.mock.module("node:fs", { defaultExport: fsMock, namedExports: fsMock });

  const connectionArgs = [];
  const errorArgs = [];
  const connectionStub = (...args) => connectionArgs.push(args);
  const errorStub = (...args) => errorArgs.push(args);
  t.mock.module("../src/controllers/socket.js", {
    namedExports: { connection: connectionStub, error: errorStub },
  });
  const socket = await import("../src/controllers/socket.js");
  t.after(() => t.mock.restoreAll());

  const httpHandlers = {};
  const httpsHandlers = {};
  const httpMgr = {
    on(event, handler) {
      httpHandlers[event] = handler;
    },
  };
  const httpsMgr = {
    on(event, handler) {
      httpsHandlers[event] = handler;
    },
  };

  httpMgr.on("connection", (sock) => socket.connection(sock, httpMgr));
  httpMgr.on("error", socket.error);
  httpsMgr.on("connection", socket.connection);
  httpsMgr.on("error", socket.error);

  let uncaught;
  t.mock.method(process, "on", (name, handler) => {
    if (name === "uncaughtException") {
      uncaught = handler;
    }
  });
  process.on("uncaughtException", (err) => baseLogger.error("uncaught exception", err));

  const sock = {};
  httpHandlers.connection(sock);
  assert.equal(connectionArgs[0]?.[0], sock);
  assert.equal(connectionArgs[0]?.[1], httpMgr);

  const err = new Error("boom");
  httpHandlers.error(err);
  assert.equal(errorArgs[0]?.[0], err);

  assert.equal(httpsHandlers.connection, socket.connection);
  assert.equal(httpsHandlers.error, socket.error);

  uncaught(err);
  assert.equal(errorLogs[0]?.[0], "uncaught exception");
  assert.equal(errorLogs[0]?.[1], err);
});

