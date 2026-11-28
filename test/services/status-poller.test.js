import test from "node:test";
import assert from "node:assert/strict";
import { createStatusPoller } from "../../src/services/status-poller.js";

const logger = { debug() {}, warn() {} };
const serviceUrl = "https://fixture.invalid";
const response = (checked) => ({
  ok: true,
  headers: new Map([["content-type", "application/json"]]),
  text: async () => JSON.stringify({ message: "ok", cpu: 0, memory: 0, checked, users: 0, interval: 15 })
});

test("overlapping refreshes share one request and an old response cannot replace a restarted poller result", async () => {
  const pending = [];
  const poller = createStatusPoller({ serviceUrl, logger, fetchStatus: (_url, { signal }) =>
    new Promise((resolve) => pending.push({ resolve, signal })) });
  const first = poller.refresh();
  assert.equal(poller.refresh(), first);
  poller.stop();
  assert.equal(pending[0].signal.aborted, true);
  const latest = poller.refresh();
  pending[1].resolve(response(2));
  await latest;
  pending[0].resolve(response(1));
  await first;
  assert.equal(poller.get().checked, 2);
});

test("the poller gives a stalled request a deadline and reports a timeout", async () => {
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const poller = createStatusPoller({ serviceUrl, logger, timeoutMs: 5, fetchStatus: (_url, { signal }) =>
      new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })) });
    assert.match((await poller.refresh()).message, /too long/);
  } finally {
    clearTimeout(keepAlive);
  }
});

test("a stale refresh cannot clear a newer pending refresh", async () => {
  const pending = [];
  const poller = createStatusPoller({
    serviceUrl, logger,
    fetchStatus: () => new Promise((resolve) => pending.push(resolve))
  });
  const old = poller.refresh();
  poller.stop();
  const current = poller.refresh();
  pending[0](response(1));
  await old;
  assert.equal(poller.refresh(), current);
  assert.equal(pending.length, 2);
  pending[1](response(2));
  assert.equal((await current).checked, 2);
});

test("a blank service never schedules or makes a request", async (t) => {
  const scheduleInterval = t.mock.method(globalThis, "setInterval");
  const scheduleTimeout = t.mock.method(globalThis, "setTimeout");
  const fetchStatus = t.mock.fn();
  const poller = createStatusPoller({ serviceUrl: "   ", logger, fetchStatus });

  poller.start();
  assert.equal((await poller.refresh()).message, "status service disabled");
  poller.stop();
  assert.equal(fetchStatus.mock.callCount(), 0);
  assert.equal(scheduleInterval.mock.callCount(), 0);
  assert.equal(scheduleTimeout.mock.callCount(), 0);
});

test("normalizes a configured HTTP URL and classifies the cause of a fetch timeout", async (t) => {
  const debug = t.mock.fn();
  const warn = t.mock.fn();
  const url = "http://fixture.invalid/moo/status/";
  const cause = Object.assign(new Error("fixture timeout"), { code: "ETIMEDOUT" });
  const fetchStatus = t.mock.fn(async () => { throw new TypeError("fetch failed", { cause }); });
  const poller = createStatusPoller({ serviceUrl: " http://fixture.invalid/ ", fetchStatus, logger: { debug, warn } });

  assert.equal(poller.get().message, "moo status unknown, not checked yet");
  const result = await poller.refresh();
  assert.equal(fetchStatus.mock.calls[0].arguments[0], url);
  assert.equal(result.state, "SITE_DOWN");
  assert.match(result.message, /too long to respond/);
  assert.deepEqual(debug.mock.calls[0].arguments, ["getting health status from " + url]);
  assert.match(warn.mock.calls[0].arguments[0], /code=ETIMEDOUT message=fetch failed$/);
});

test("diagnostics cap upstream body previews and handle missing headers", async (t) => {
  const cases = [
    { ok: false, type: null, body: "server error " + "x".repeat(200) },
    { ok: true, type: null, body: "not JSON " + "x".repeat(200) },
    { ok: true, type: "application/json", body: "invalid JSON " + "x".repeat(200) },
    { ok: true, type: "application/json", body: JSON.stringify({ message: "x".repeat(200) }) },
    { ok: true, type: "application/json", body: "null" }
  ];
  for (const { ok, type, body } of cases) {
    const warn = t.mock.fn();
    const poller = createStatusPoller({
      serviceUrl, logger: { ...logger, warn },
      fetchStatus: async () => ({ ok, status: ok ? 200 : 502, headers: { get: () => type }, text: async () => body })
    });
    assert.equal((await poller.refresh()).state, "SITE_DOWN");
    const message = warn.mock.calls[0].arguments[0];
    if (!type) assert.match(message, /contentType=unknown/);
    if (body === "null") assert.match(message, /unexpected schema/);
    assert.ok(message.endsWith("bodyPreview=" + JSON.stringify(body.slice(0, 160))));
  }
});

test("start is idempotent and stop clears both scheduled callbacks", (t) => {
  const interval = { unref: t.mock.fn() };
  const initial = { unref: t.mock.fn() };
  const scheduleInterval = t.mock.method(globalThis, "setInterval", () => interval);
  const scheduleTimeout = t.mock.method(globalThis, "setTimeout", () => initial);
  const clearInterval = t.mock.method(globalThis, "clearInterval", () => {});
  const clearTimeout = t.mock.method(globalThis, "clearTimeout", () => {});
  const poller = createStatusPoller({ serviceUrl, logger, intervalMs: 2500 });

  poller.start();
  poller.start();
  assert.equal(scheduleInterval.mock.callCount(), 1);
  assert.equal(scheduleTimeout.mock.callCount(), 1);
  assert.deepEqual(scheduleInterval.mock.calls[0].arguments, [poller.refresh, 2500]);
  poller.stop();
  assert.deepEqual(clearInterval.mock.calls[0].arguments, [interval]);
  assert.deepEqual(clearTimeout.mock.calls[0].arguments, [initial]);
  poller.start();
  assert.equal(scheduleInterval.mock.callCount(), 2);
  assert.equal(scheduleTimeout.mock.callCount(), 2);
  poller.stop();
});

test("a rejected fetch without an error object still degrades the current status", async (t) => {
  const warn = t.mock.fn();
  const poller = createStatusPoller({
    serviceUrl,
    logger: { ...logger, warn },
    fetchStatus: () => Promise.reject(undefined)
  });

  assert.equal((await poller.refresh()).state, "SITE_DOWN");
  assert.match(warn.mock.calls[0].arguments[0], /code=UNKNOWN message=no message$/);
});
