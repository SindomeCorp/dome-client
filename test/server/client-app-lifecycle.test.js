import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import { close, listen, resolveBoundAddress } from "../../src/server/lifecycle.js";

test("listen passes binding arguments and removes its temporary error listener", { timeout: 1000 }, async (t) => {
  const server = new EventEmitter();
  server.listen = t.mock.fn((_port, _address, ready) => ready());
  await listen(server, 0, "127.0.0.1");
  assert.deepEqual(server.listen.mock.calls[0].arguments.slice(0, 2), [0, "127.0.0.1"]);
  assert.equal(server.listenerCount("error"), 0);
});

test("listen rejects with the original binding error", { timeout: 1000 }, async () => {
  const server = new EventEmitter();
  const error = new Error("fixture bind failure");
  server.listen = () => server.emit("error", error);
  await assert.rejects(listen(server, 0), (caught) => caught === error);
  assert.equal(server.listenerCount("error"), 0);
});

test("listen clears the error listener when Node rejects invalid bind arguments", { timeout: 1000 }, async () => {
  const server = createServer();
  const previous = server.listeners("error");

  await assert.rejects(listen(server, -1, "127.0.0.1"), { code: "ERR_SOCKET_BAD_PORT" });
  assert.deepEqual(server.listeners("error"), previous);
});

test("a failed HTTP bind releases listeners before a successful retry", { timeout: 3000 }, async (t) => {
  const owner = createServer();
  const server = createServer((_request, response) => response.end("retry worked"));
  t.after(async () => {
    for (const instance of [owner, server]) {
      await new Promise(resolve => instance.close(() => resolve()));
    }
  });

  const onError = () => {};
  server.on("error", onError);
  const existingListening = server.listeners("listening");
  await listen(owner, 0, "127.0.0.1");
  const { port } = owner.address();
  await assert.rejects(listen(server, port, "127.0.0.1"), { code: "EADDRINUSE" });
  assert.deepEqual(server.listeners("error"), [onError]);
  assert.deepEqual(server.listeners("listening"), existingListening);

  await listen(server, 0, "127.0.0.1");
  const response = await fetch("http://127.0.0.1:" + server.address().port, { signal: AbortSignal.timeout(1000) });
  assert.equal(await response.text(), "retry worked");
  assert.deepEqual(server.listeners("error"), [onError]);
  assert.deepEqual(server.listeners("listening"), existingListening);
});

test("bound addresses retain the transport fields and handle inactive servers", () => {
  assert.equal(resolveBoundAddress(undefined), null);
  assert.equal(resolveBoundAddress({}), null);
  assert.equal(resolveBoundAddress({ address: () => null }), null);
  assert.deepEqual(resolveBoundAddress({ address: () => "/tmp/fixture.sock" }), {
    type: "pipe", path: "/tmp/fixture.sock"
  });
  assert.deepEqual(resolveBoundAddress({ address: () => ({ address: "127.0.0.1", family: "IPv4", port: 4318 }) }), {
    type: "tcp", address: "127.0.0.1", family: "IPv4", port: 4318
  });
});

test("close waits for the server to finish and accepts an absent server", { timeout: 1000 }, async () => {
  await close();
  await close({});
  let complete;
  const listeners = { close(callback) { complete = callback; } };
  let closed = false;
  const shuttingDown = close(listeners).then(() => { closed = true; });
  await Promise.resolve();
  assert.equal(closed, false);
  complete();
  await shuttingDown;
  assert.equal(closed, true);
});

test("socket managers forward connections and errors for both enabled transports", async (t) => {
  const { bindSocketManagers } = await import("../../src/server/socket-managers.js");
  const httpMgr = new EventEmitter();
  const httpsMgr = new EventEmitter();
  const socket = { connection: t.mock.fn(), error: t.mock.fn() };
  bindSocketManagers({ httpMgr, httpsMgr, socket });

  const connection = {};
  const failure = new Error("fixture");
  httpMgr.emit("connection", connection);
  httpsMgr.emit("connection", connection);
  httpMgr.emit("error", failure);
  httpsMgr.emit("error", failure);
  assert.deepEqual(socket.connection.mock.calls.map(({ arguments: args }) => args), [
    [connection, httpMgr], [connection]
  ]);
  assert.deepEqual(socket.error.mock.calls.map(({ arguments: args }) => args), [[failure], [failure]]);

  const plainHttp = new EventEmitter();
  bindSocketManagers({ httpMgr: plainHttp, socket });
  plainHttp.emit("connection", connection);
  assert.deepEqual(socket.connection.mock.calls[2].arguments, [connection, plainHttp]);
});

test("server wiring passes TLS options and applies the same admission rule to both socket managers", async (t) => {
  const { createHttpServers } = await import("../../src/server/servers.js");
  const http = { createServer: () => ({ transport: "http" }) };
  const https = { createServer: t.mock.fn(() => ({ transport: "https" })) };
  const app = { set: t.mock.fn() };
  const logger = { info: t.mock.fn(), warn: t.mock.fn() };
  const fs = { readFileSync: t.mock.fn((file) => Buffer.from(file)) };
  class SocketServer {
    constructor(server, options) {
      this.server = server;
      this.options = options;
    }
  }
  const dependencies = { app, logger, fs, http, https, SocketServer };
  const ssl = { key: "key-fixture", cert: "cert-fixture", ca: "ca-fixture", passphrase: "test-phrase" };
  const tls = { key: Buffer.from(ssl.key), cert: Buffer.from(ssl.cert), ca: Buffer.from(ssl.ca), passphrase: ssl.passphrase };
  const result = createHttpServers({
    ...dependencies,
    config: { ssl, node: { socketProxied: true } },
    ipBlocklist: new Set(["192.0.2.5"])
  });

  assert.deepEqual(https.createServer.mock.calls[0].arguments, [tls, app]);
  assert.deepEqual(app.set.mock.calls.map(({ arguments: args }) => args), [
    ["socketServer", result.httpMgr], ["httpsSocketServer", result.httpsMgr]
  ]);
  assert.deepEqual(logger.info.mock.calls.map(({ arguments: args }) => args[0]), [
    "socket.io listening to http", "socket.io listening to https"
  ]);
  for (const manager of [result.httpMgr, result.httpsMgr]) {
    const reply = t.mock.fn();
    manager.options.allowRequest({
      socket: { remoteAddress: "127.0.0.1" }, headers: { "x-forwarded-for": "192.0.2.5" }
    }, reply);
    manager.options.allowRequest({
      socket: { remoteAddress: "127.0.0.1" }, headers: { "x-forwarded-for": "192.0.2.6" }
    }, reply);
    assert.deepEqual(reply.mock.calls.map(({ arguments: args }) => args), [
      ["Forbidden", false], [null, true]
    ]);
  }
  assert.match(logger.warn.mock.calls[0].arguments[0], /^Blocked socket\.io request from 192\.0\.2\.5$/);
  const plain = createHttpServers({ ...dependencies, config: { node: { socketProxied: false } } });
  assert.equal(plain.sslServer, undefined);
  assert.equal(https.createServer.mock.callCount(), 1);
  const reply = t.mock.fn();
  plain.httpMgr.options.allowRequest({ socket: { remoteAddress: "127.0.0.1" }, headers: {} }, reply);
  assert.deepEqual(reply.mock.calls[0].arguments, [null, true]);

  const { key, cert } = ssl;
  createHttpServers({ ...dependencies, config: { ssl: { key, cert }, node: {} } });
  assert.deepEqual(https.createServer.mock.calls[1].arguments, [{ key: tls.key, cert: tls.cert }, app]);
});
