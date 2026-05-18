import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// ensure mocks after global variable assignments

test("logger falls back to fetch when sendBeacon is unavailable", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const { window } = dom;
  const orig = {
    window: globalThis.window,
    navigator: globalThis.navigator,
    fetch: globalThis.fetch
  };
  globalThis.window = window;
  Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
  window.LOG_ENDPOINT = "/log";

  delete window.navigator.sendBeacon;

  const fetchCalls = [];
  globalThis.fetch = (...args) => {
    fetchCalls.push(args);
    return Promise.resolve({ ok: true });
  };
  t.after(() => {
    globalThis.window = orig.window;
    Object.defineProperty(globalThis, "navigator", { value: orig.navigator, configurable: true });
    globalThis.fetch = orig.fetch;
  });

  const logger = (await import(`../../src/client/pages/logger.js?cachebust=${Date.now()}`)).default;

  logger.warn("fetch fallback");

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0][0], "/log");
  assert.deepEqual(fetchCalls[0][1], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level: "warn", message: "fetch fallback" })
  });

});

test("logger sends messages and logs to console", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const { window } = dom;
  const orig = { window: globalThis.window, navigator: globalThis.navigator };
  globalThis.window = window;
  Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
  window.LOG_ENDPOINT = "/log";

  const beaconCalls = [];
  window.navigator.sendBeacon = (...args) => {
    beaconCalls.push(args);
    return true;
  };

  const messages = { log: [], info: [], warn: [], error: [] };
  const originals = {};
  ["log", "info", "warn", "error"].forEach(level => {
    originals[level] = console[level];
    console[level] = (...args) => messages[level].push(args.join(" "));
  });

  const logger = (await import(`../../src/client/pages/logger.js?cachebust=${Date.now()}`)).default;

  logger.log("hello", "world");
  logger.info("info message");
  logger.warn("object", { a: 1 });
  logger.error("fail now");

  assert.deepEqual(messages.log, ["hello world"]);
  assert.deepEqual(messages.info, ["info message"]);
  assert.deepEqual(messages.warn, ["object [object Object]"]);
  assert.deepEqual(messages.error, ["fail now"]);

  assert.equal(beaconCalls.length, 4);
  assert.deepEqual(beaconCalls.map(c => c[0]), ["/log", "/log", "/log", "/log"]);
  assert.deepEqual(
    beaconCalls.map(c => JSON.parse(c[1])),
    [
      { level: "log", message: "hello world" },
      { level: "info", message: "info message" },
      { level: "warn", message: "object {\"a\":1}" },
      { level: "error", message: "fail now" }
    ]
  );

  Object.entries(originals).forEach(([level, fn]) => {
    console[level] = fn;
  });
  t.after(() => {
    globalThis.window = orig.window;
    Object.defineProperty(globalThis, "navigator", { value: orig.navigator, configurable: true });
  });
});

test("logger logs to console when endpoint missing", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const { window } = dom;
  const orig = {
    window: globalThis.window,
    navigator: globalThis.navigator,
    fetch: globalThis.fetch
  };
  globalThis.window = window;
  Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });

  const beaconCalls = [];
  window.navigator.sendBeacon = (...args) => {
    beaconCalls.push(args);
    return true;
  };

  const fetchCalls = [];
  globalThis.fetch = (...args) => {
    fetchCalls.push(args);
    return Promise.resolve({ ok: true });
  };

  const messages = [];
  const origInfo = console.info;
  console.info = (...args) => messages.push(args.join(" "));

  const logger = (await import(`../../src/client/pages/logger.js?cachebust=${Date.now()}`)).default;

  logger.info("hello world");

  assert.deepEqual(messages, ["hello world"]);
  assert.equal(beaconCalls.length, 0);
  assert.equal(fetchCalls.length, 0);

  console.info = origInfo;
  t.after(() => {
    globalThis.window = orig.window;
    Object.defineProperty(globalThis, "navigator", { value: orig.navigator, configurable: true });
    globalThis.fetch = orig.fetch;
  });
});


