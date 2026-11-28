/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { get } from "../../src/controllers/health.js";

test("get returns aggregated health metrics", (t) => {
  const startTime = new Date("2024-01-02T03:04:05.678Z");
  const httpServer = { engine: { clientsCount: 5 } };
  const httpsServer = {
    of() {
      return { sockets: new Map([["a", {}], ["b", {}]]) };
    }
  };
  const values = new Map([
    ["socketServer", httpServer],
    ["httpsSocketServer", httpsServer],
    ["appStartTime", startTime]
  ]);
  const req = {
    app: {
      get: (key) => values.get(key)
    }
  };
  const res = { json: t.mock.fn() };
  const memUsage = { rss: 123456, heapUsed: 654321 };
  const memMock = t.mock.method(process, "memoryUsage", () => memUsage);
  const loadMock = t.mock.method(os, "loadavg", () => [1.1, 2.2, 3.3]);
  t.after(() => {
    memMock.mock.restore();
    loadMock.mock.restore();
  });

  const payload = get(req, res);
  assert.equal(res.json.mock.callCount(), 1);
  assert.deepEqual(res.json.mock.calls[0].arguments[0], payload);
  assert.equal(payload.currentRss, memUsage.rss);
  assert.equal(payload.currentHeapUsed, memUsage.heapUsed);
  assert.equal(payload.currentlyConnected, 7);
  assert.deepEqual(payload.cpuLoad, { "1m": 1.1, "5m": 2.2, "15m": 3.3 });
  assert.equal(payload.lastRestart, startTime.toISOString());
});

test("get counts sockets from objects and falls back to uptime", (t) => {
  const sockets = { a: {}, b: {}, c: {} };
  const httpServer = { sockets: { sockets } };
  const values = new Map([["socketServer", httpServer]]);
  const req = {
    app: {
      get: (key) => values.get(key)
    }
  };
  const res = { json: t.mock.fn() };
  const memMock = t.mock.method(process, "memoryUsage", () => ({ rss: 1, heapUsed: 2 }));
  const loadMock = t.mock.method(os, "loadavg", () => [0, undefined, NaN]);
  const uptimeMock = t.mock.method(process, "uptime", () => 42);
  const now = 1_700_000_000_000;
  const nowMock = t.mock.method(Date, "now", () => now);
  t.after(() => {
    memMock.mock.restore();
    loadMock.mock.restore();
    uptimeMock.mock.restore();
    nowMock.mock.restore();
  });

  const payload = get(req, res);
  assert.equal(payload.currentlyConnected, 3);
  assert.deepEqual(payload.cpuLoad, { "1m": 0, "5m": 0, "15m": 0 });
  const expectedRestart = new Date(now - 42000).toISOString();
  assert.equal(payload.lastRestart, expectedRestart);
  assert.equal(res.json.mock.callCount(), 1);
  assert.deepEqual(res.json.mock.calls[0].arguments[0], payload);
});

test("counts supported fallback socket collections and queries the default namespace", (t) => {
  const of = t.mock.fn(() => undefined);
  const servers = {
    socketServer: { of, sockets: { length: 4 } },
    httpsSocketServer: { sockets: { a: {}, b: {} } }
  };
  const response = { json: t.mock.fn() };
  const result = get({ app: { get: (name) => servers[name] } }, response);
  assert.deepEqual(of.mock.calls[0].arguments, ["/"]);
  assert.equal(result.currentlyConnected, 6);
});

test("accepts a serialized restart timestamp and falls back when the app has no usable timestamp", (t) => {
  t.mock.method(os, "loadavg", () => null);
  t.mock.method(process, "uptime", () => 4);
  const now = 1_700_000_000_000;
  t.mock.method(Date, "now", () => now);
  const parsedTime = "2024-02-01T11:22:33Z";
  const response = { json: t.mock.fn() };
  const fallback = new Date(now - 4000).toISOString();

  assert.equal(get({ app: { get: () => parsedTime } }, response).lastRestart, new Date(parsedTime).toISOString());
  assert.equal(get({ app: { get: () => "not a timestamp" } }, response).lastRestart, fallback);
  assert.equal(get({ app: { get: () => new Date(NaN) } }, response).lastRestart, fallback);
  assert.equal(get({ app: { get: () => null } }, response).lastRestart, fallback);
  assert.equal(get({ app: {} }, response).lastRestart, fallback);
  const missingApp = get({}, response);
  assert.equal(missingApp.lastRestart, fallback);
  assert.equal(missingApp.currentlyConnected, 0);
  assert.deepEqual(missingApp.cpuLoad, { "1m": 0, "5m": 0, "15m": 0 });
});
