/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";

async function loadStatus(t, { fetchImpl, logger, skipInitialCheck = false, serviceUrl = "status.example.com" } = {}) {
  const configMock = t.mock.module("../../src/config/index.js", { defaultExport: { status: { serviceUrl } } });
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

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        return String(name).toLowerCase() === "content-type" ? "application/json" : "";
      }
    },
    text: async () => JSON.stringify(body)
  };
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
    fetchImpl: t.mock.fn(async () => jsonResponse(expected)),
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
    fetchImpl: t.mock.fn(async () => jsonResponse(expected)),
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
    return jsonResponse(status);
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
  ["EUNKNOWN", "moo status unknown, status service returned an unexpected response"]
]) {
  test(`healthCheck handles ${code}`, async (t) => {
    const logger = { debug() {}, info() {}, warn: t.mock.fn(), error() {} };
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
    assert.equal(logger.warn.mock.callCount(), 1);
  });
}

test("healthCheck handles json parse error", async (t) => {
  const logger = { debug() {}, info() {}, warn: t.mock.fn(), error() {} };
  const { mod } = await loadStatus(t, {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: {
        get(name) {
          return String(name).toLowerCase() === "content-type" ? "application/json" : "";
        }
      },
      text: async () => {
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
  assert.equal(logger.warn.mock.callCount(), 1);
});

test("healthCheck degrades when status payload schema is malformed", async (t) => {
  const logger = { debug() {}, info() {}, warn: t.mock.fn(), error() {} };
  const { mod } = await loadStatus(t, {
    fetchImpl: async () => jsonResponse({
      message: "moo ok",
      cpu: "bad",
      memory: 2,
      checked: 3,
      users: 4,
      interval: 5,
      state: "OK"
    }),
    logger
  });
  const { get } = mod;
  const status = get({}, { json() {} });
  assert.equal(status.message, "moo status unknown, status service returned an unexpected response");
  assert.equal(status.state, "SITE_DOWN");
  assert.equal(logger.warn.mock.callCount(), 1);
});

test("status service disabled returns stable default and does not call fetch", async (t) => {
  const fetchImpl = t.mock.fn(async () => jsonResponse({ message: "unused", cpu: 1, memory: 1, checked: 1, users: 1, interval: 1, state: "OK" }));
  const { mod } = await loadStatus(t, {
    fetchImpl,
    serviceUrl: ""
  });
  const status = mod.get({}, { json() {} });
  assert.equal(status.message, "status service disabled");
  assert.equal(status.state, undefined);
  assert.equal(fetchImpl.mock.callCount(), 0);
});

test("status request normalizes URL when scheme and path are missing", async (t) => {
  const fetchImpl = t.mock.fn(async () => jsonResponse({
    message: "ok",
    cpu: 1,
    memory: 2,
    checked: 3,
    users: 4,
    interval: 5,
    state: "OK"
  }));
  await loadStatus(t, {
    fetchImpl,
    serviceUrl: "status.example.com"
  });
  assert.equal(fetchImpl.mock.callCount(), 1);
  assert.equal(fetchImpl.mock.calls[0].arguments[0], "https://status.example.com/moo/status/");
});

test("healthCheck handles non-ok HTTP responses", async (t) => {
  const logger = { debug() {}, info() {}, warn: t.mock.fn(), error() {} };
  const { mod } = await loadStatus(t, {
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      headers: { get: () => "application/json" },
      text: async () => "{\"message\":\"down\"}"
    }),
    logger
  });
  const status = mod.get({}, { json() {} });
  assert.equal(status.message, "moo status unknown, status service returned an unexpected response");
  assert.equal(status.state, "SITE_DOWN");
  assert.equal(logger.warn.mock.callCount(), 1);
  assert.match(String(logger.warn.mock.calls[0].arguments[0]), /status=503/);
  assert.match(String(logger.warn.mock.calls[0].arguments[0]), /status\.example\.com/);
});

test("healthCheck handles non-json content type", async (t) => {
  const logger = { debug() {}, info() {}, warn: t.mock.fn(), error() {} };
  const { mod } = await loadStatus(t, {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "text/plain" },
      text: async () => "ok"
    }),
    logger
  });
  const status = mod.get({}, { json() {} });
  assert.equal(status.message, "moo status unknown, status service returned an unexpected response");
  assert.equal(logger.warn.mock.callCount(), 1);
  assert.match(String(logger.warn.mock.calls[0].arguments[0]), /non-JSON response/);
  assert.match(String(logger.warn.mock.calls[0].arguments[0]), /contentType=text\/plain/);
});

test("healthCheck handles invalid JSON response text", async (t) => {
  const logger = { debug() {}, info() {}, warn: t.mock.fn(), error() {} };
  const { mod } = await loadStatus(t, {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => "{\"message\":"
    }),
    logger
  });
  const status = mod.get({}, { json() {} });
  assert.equal(status.message, "moo status unknown, status service returned an unexpected response");
  assert.equal(status.state, "SITE_DOWN");
  assert.equal(logger.warn.mock.callCount(), 1);
  assert.match(String(logger.warn.mock.calls[0].arguments[0]), /invalid JSON/);
});

test("healthCheck degrades when status state is non-string", async (t) => {
  const logger = { debug() {}, info() {}, warn: t.mock.fn(), error() {} };
  const { mod } = await loadStatus(t, {
    fetchImpl: async () => jsonResponse({
      message: "moo ok",
      cpu: 1,
      memory: 2,
      checked: 3,
      users: 4,
      interval: 5,
      state: 7
    }),
    logger
  });
  const status = mod.get({}, { json() {} });
  assert.equal(status.message, "moo status unknown, status service returned an unexpected response");
  assert.equal(status.state, "SITE_DOWN");
  assert.equal(logger.warn.mock.callCount(), 1);
});

test("status request preserves explicit path and query", async (t) => {
  const fetchImpl = t.mock.fn(async () => jsonResponse({
    message: "ok",
    cpu: 1,
    memory: 2,
    checked: 3,
    users: 4,
    interval: 5,
    state: "OK"
  }));
  await loadStatus(t, {
    fetchImpl,
    serviceUrl: "https://status.example.com/custom/path?check=1"
  });
  assert.equal(fetchImpl.mock.callCount(), 1);
  assert.equal(fetchImpl.mock.calls[0].arguments[0], "https://status.example.com/custom/path?check=1");
});

test("interval and timeout handles call unref when available", async (t) => {
  const unrefInterval = t.mock.fn();
  const unrefTimeout = t.mock.fn();
  const configMock = t.mock.module("../../src/config/index.js", { defaultExport: { status: { serviceUrl: "status.example.com" } } });
  const loggerMock = t.mock.module("../../src/logger.js", {
    namedExports: {
      named: () => ({ debug() {}, info() {}, warn() {}, error() {} })
    }
  });
  let intervalFn;
  let timeoutFn;
  const intervalMock = t.mock.method(global, "setInterval", (fn) => {
    intervalFn = fn;
    return { unref: unrefInterval };
  });
  const timeoutMock = t.mock.method(global, "setTimeout", (fn) => {
    timeoutFn = fn;
    return { unref: unrefTimeout };
  });
  const fetchMock = t.mock.method(global, "fetch", t.mock.fn(async () => jsonResponse({
    message: "ok",
    cpu: 1,
    memory: 2,
    checked: 3,
    users: 4,
    interval: 5,
    state: "OK"
  })));
  await import(`../../src/controllers/status.js?unref=${Date.now()}`);
  assert.equal(unrefInterval.mock.callCount(), 1);
  assert.equal(unrefTimeout.mock.callCount(), 1);
  const runInterval = intervalFn?.();
  if (runInterval?.then) {
    await runInterval;
  }
  const runTimeout = timeoutFn?.();
  if (runTimeout?.then) {
    await runTimeout;
  }
  assert.equal(fetchMock.mock.callCount(), 2);
  intervalMock.mock.restore();
  timeoutMock.mock.restore();
  fetchMock.mock.restore();
  configMock.restore();
  loggerMock.restore();
});

test("interval and timeout handles skip unref when unavailable", async (t) => {
  const configMock = t.mock.module("../../src/config/index.js", { defaultExport: { status: { serviceUrl: "status.example.com" } } });
  const loggerMock = t.mock.module("../../src/logger.js", {
    namedExports: {
      named: () => ({ debug() {}, info() {}, warn() {}, error() {} })
    }
  });
  let intervalFn;
  let timeoutFn;
  const intervalMock = t.mock.method(global, "setInterval", (fn) => {
    intervalFn = fn;
    return {};
  });
  const timeoutMock = t.mock.method(global, "setTimeout", (fn) => {
    timeoutFn = fn;
    return {};
  });
  const fetchMock = t.mock.method(global, "fetch", t.mock.fn(async () => jsonResponse({
    message: "ok",
    cpu: 1,
    memory: 2,
    checked: 3,
    users: 4,
    interval: 5,
    state: "OK"
  })));
  await import(`../../src/controllers/status.js?nounref=${Date.now()}`);
  assert.equal(intervalMock.mock.callCount(), 1);
  assert.equal(timeoutMock.mock.callCount(), 1);
  const runInterval = intervalFn?.();
  if (runInterval?.then) {
    await runInterval;
  }
  const runTimeout = timeoutFn?.();
  if (runTimeout?.then) {
    await runTimeout;
  }
  assert.equal(fetchMock.mock.callCount(), 2);
  intervalMock.mock.restore();
  timeoutMock.mock.restore();
  fetchMock.mock.restore();
  configMock.restore();
  loggerMock.restore();
});

test("healthCheck warns with UNKNOWN code and no message fallbacks", async (t) => {
  const logger = { debug() {}, info() {}, warn: t.mock.fn(), error() {} };
  const { mod } = await loadStatus(t, {
    fetchImpl: async () => {
      throw {};
    },
    logger
  });
  const status = mod.get({}, { json() {} });
  assert.equal(status.state, "SITE_DOWN");
  assert.equal(status.message, "moo status unknown, status service returned an unexpected response");
  assert.equal(logger.warn.mock.callCount(), 1);
  const msg = String(logger.warn.mock.calls[0].arguments[0]);
  assert.match(msg, /code=UNKNOWN/);
  assert.match(msg, /message=no message/);
});

test("scheduler callbacks execute repeatedly without hanging and keep status readable", async (t) => {
  const expected = {
    message: "moo ok",
    cpu: 10,
    memory: 20,
    checked: 30,
    users: 40,
    interval: 50,
    state: "OK"
  };
  const logger = { debug() {}, info() {}, warn() {}, error() {} };
  const { mod, runHealthCheck, runInitialCheck } = await loadStatus(t, {
    fetchImpl: t.mock.fn(async () => jsonResponse(expected)),
    logger,
    skipInitialCheck: true
  });

  const first = runInitialCheck();
  if (first?.then) {
    await first;
  }
  const second = runHealthCheck();
  if (second?.then) {
    await second;
  }
  const third = runHealthCheck();
  if (third?.then) {
    await third;
  }

  const res = { json: t.mock.fn() };
  const status = mod.get({}, res);
  assert.deepEqual(status, expected);
  assert.deepEqual(res.json.mock.calls[0].arguments[0], expected);
});

test("refreshStatus rejects malformed required numeric fields", async (t) => {
  const invalidPayloads = [
    { message: "ok", cpu: "bad", memory: 2, checked: 3, users: 4, interval: 5, state: "OK" },
    { message: "ok", cpu: 1, memory: null, checked: 3, users: 4, interval: 5, state: "OK" },
    { message: "ok", cpu: 1, memory: 2, checked: NaN, users: 4, interval: 5, state: "OK" },
    { message: "ok", cpu: 1, memory: 2, checked: 3, users: Infinity, interval: 5, state: "OK" },
    { message: "ok", cpu: 1, memory: 2, checked: 3, users: 4, interval: "5", state: "OK" },
    { cpu: 1, memory: 2, checked: 3, users: 4, interval: 5, state: "OK" }
  ];
  let idx = 0;
  const logger = { debug() {}, info() {}, warn: t.mock.fn(), error() {} };
  const { mod } = await loadStatus(t, {
    logger,
    fetchImpl: async () => jsonResponse(invalidPayloads[idx++])
  });

  const first = mod.get({}, { json() {} });
  assert.equal(first.state, "SITE_DOWN");
  assert.equal(first.message, "moo status unknown, status service returned an unexpected response");

  for (let i = 1; i < invalidPayloads.length; i += 1) {
    await mod.refreshStatus();
    const status = mod.get({}, { json() {} });
    assert.equal(status.state, "SITE_DOWN");
    assert.equal(status.message, "moo status unknown, status service returned an unexpected response");
  }
  assert.ok(logger.warn.mock.callCount() >= invalidPayloads.length);
});

test("healthCheck malformed schema warning includes schema marker and body preview", async (t) => {
  const logger = { debug() {}, info() {}, warn: t.mock.fn(), error() {} };
  const bodyText = JSON.stringify({
    message: "ok",
    cpu: "bad",
    memory: 2,
    checked: 3,
    users: 4,
    interval: 5,
    state: "OK"
  });
  const { mod } = await loadStatus(t, {
    logger,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => bodyText
    })
  });
  const status = mod.get({}, { json() {} });
  assert.equal(status.state, "SITE_DOWN");
  assert.equal(logger.warn.mock.callCount(), 1);
  const msg = String(logger.warn.mock.calls[0].arguments[0]);
  assert.match(msg, /unexpected schema/);
  assert.match(msg, /bodyPreview=/);
});

test("repeated failure refresh updates checked timestamp monotonically", async (t) => {
  const logger = { debug() {}, info() {}, warn: t.mock.fn(), error() {} };
  const nowValues = [1000, 2000, 3000];
  const dateNowMock = t.mock.method(Date, "now", () => nowValues.shift() || 4000);
  const { mod } = await loadStatus(t, {
    logger,
    fetchImpl: async () => {
      const err = new Error("timeout");
      err.code = "ETIMEOUT";
      throw err;
    }
  });

  const first = mod.get({}, { json() {} });
  await mod.refreshStatus();
  const second = mod.get({}, { json() {} });
  await mod.refreshStatus();
  const third = mod.get({}, { json() {} });
  assert.ok(Number.isFinite(first.checked));
  assert.ok(Number.isFinite(second.checked));
  assert.ok(Number.isFinite(third.checked));
  assert.ok(first.checked < second.checked && second.checked < third.checked);
  dateNowMock.mock.restore();
});
