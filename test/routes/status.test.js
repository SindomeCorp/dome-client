/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";

async function loadStatus(t, { fetchImpl, logger, skipInitialCheck = false } = {}) {
  const configMock = t.mock.module("../../src/config/index.js", { defaultExport: { status: { serviceUrl: "status.example.com" } } });
  const loggerMock = t.mock.module("../../src/logger.js", {
    namedExports: {
      named: () => (logger || { debug() {}, info() {}, warn() {}, error() {} })
    }
  });
  let intervalFn;
  const intervalMock = t.mock.method(global, "setInterval", (fn) => {
    intervalFn = fn;
  });
  let healthCheckPromise;
  let timeoutFn;
  const timeoutMock = t.mock.method(global, "setTimeout", (fn) => {
    if (skipInitialCheck) {
      timeoutFn = fn;
    } else {
      healthCheckPromise = fn();
    }
  });
  const fetchMock = t.mock.method(global, "fetch", fetchImpl);
  const mod = await import("../../src/controllers/status.js?c=" + Date.now());
  if (!skipInitialCheck && healthCheckPromise?.then) {
    await healthCheckPromise;
  }
  configMock.restore();
  loggerMock.restore();
  t.after(() => {
    intervalMock.mock.restore();
    timeoutMock.mock.restore();
    fetchMock.mock.restore();
  });
  return { mod, runHealthCheck: intervalFn, runInitialCheck: timeoutFn };
}

test("healthCheck updates lastStatus", async (t) => {
  const expected = {
    message: "moo ok",
    cpu: 1,
    memory: 2,
    checked: 3,
    users: 4,
    interval: 5,
    state: "OK"
  };
  const logger = { debug() {}, info: t.mock.fn(), warn() {}, error: t.mock.fn() };
  const { mod } = await loadStatus(t, {
    fetchImpl: t.mock.fn(async () => ({
      json: async () => expected
    })),
    logger
  });
  const { get } = mod;
  const res = { json: t.mock.fn() };
  const status = get({}, res);
  assert.deepEqual(status, expected);
  assert.deepEqual(res.json.mock.calls[0].arguments[0], expected);
  assert.equal(logger.info.mock.callCount(), 0);
  assert.equal(logger.error.mock.callCount(), 0);
});

test("get returns default status before first check then updates after", async (t) => {
  const expected = {
    message: "moo ok",
    cpu: 1,
    memory: 2,
    checked: 3,
    users: 4,
    interval: 5,
    state: "OK"
  };
  const { mod, runInitialCheck } = await loadStatus(t, {
    fetchImpl: t.mock.fn(async () => ({
      json: async () => expected
    })),
    skipInitialCheck: true
  });
  const { get } = mod;
  const res1 = { json: t.mock.fn() };
  const status1 = get({}, res1);
  assert.equal(status1.state, "UNKNOWN");
  assert.equal(res1.json.mock.calls[0].arguments[0].state, "UNKNOWN");
  const maybePromise = runInitialCheck();
  if (maybePromise?.then) {
    await maybePromise;
  }
  const res2 = { json: t.mock.fn() };
  const status2 = get({}, res2);
  assert.deepEqual(status2, expected);
  assert.deepEqual(res2.json.mock.calls[0].arguments[0], expected);
});

test("get returns latest status after subsequent check", async (t) => {
  const first = {
    message: "moo ok",
    cpu: 1,
    memory: 2,
    checked: 3,
    users: 4,
    interval: 5,
    state: "OK"
  };
  const second = {
    message: "moo still ok",
    cpu: 6,
    memory: 7,
    checked: 8,
    users: 9,
    interval: 10,
    state: "OK"
  };
  const statuses = [first, second];
  const fetchImpl = t.mock.fn(async () => {
    const status = statuses.shift();
    return { json: async () => status };
  });
  const { mod, runHealthCheck } = await loadStatus(t, { fetchImpl });
  const { get } = mod;
  const res1 = { json: t.mock.fn() };
  assert.deepEqual(get({}, res1), first);
  assert.deepEqual(res1.json.mock.calls[0].arguments[0], first);
  const maybePromise = runHealthCheck();
  if (maybePromise?.then) {
    await maybePromise;
  }
  const res2 = { json: t.mock.fn() };
  assert.deepEqual(get({}, res2), second);
  assert.deepEqual(res2.json.mock.calls[0].arguments[0], second);
});

for (const [code, message] of [
  ["ECONNREFUSED", "moo status unknown, status service is probably down (or restarting)"],
  ["ETIMEOUT", "moo status unknown, status service took too long to respond"],
  ["ENOTFOUND", "moo status unknown, status service host unreachable from webclient server"],
  ["EUNKNOWN", "moo status unknown, unexpected error EUNKNOWN"]
]) {
  test(`healthCheck handles ${code}`, async (t) => {
    const logger = { debug() {}, info() {}, warn() {}, error: t.mock.fn() };
    const { mod } = await loadStatus(t, {
      fetchImpl: async () => {
        const err = new Error("fail");
        err.code = code;
        throw err;
      },
      logger
    });
    const { get } = mod;
    const status = get({}, { json() {} });
    assert.equal(status.message, message);
    assert.equal(logger.error.mock.callCount(), 1);
  });
}

test("healthCheck handles json parse error", async (t) => {
  const logger = { debug() {}, info() {}, warn() {}, error: t.mock.fn() };
  const { mod } = await loadStatus(t, {
    fetchImpl: async () => ({
      json: async () => {
        const err = new Error("fail");
        err.code = "ETIMEOUT";
        throw err;
      }
    }),
    logger
  });
  const { get } = mod;
  const status = get({}, { json() {} });
  assert.equal(status.message, "moo status unknown, status service took too long to respond");
  assert.equal(logger.error.mock.callCount(), 1);
});
