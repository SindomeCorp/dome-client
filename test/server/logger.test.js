/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import dotenv from "dotenv";
import util from "node:util";

const envUrl = new URL("../../src/env.js", import.meta.url);
let importCounter = 0;
async function loadLogger() {
  await import(`${envUrl}?cachebust=${importCounter++}`);
  return import(`../../src/logger.js?cachebust=${importCounter++}`);
}

test("named returns child logger with namespace", async (t) => {
  const configMock = t.mock.method(dotenv, "config", () => ({}));
  const logger = await loadLogger();
  const logMock = t.mock.method(logger.default.transports[0], "log");
  const child = logger.named("alpha");

  assert.notEqual(child, logger.default);
  child.info("test");

  assert.equal(logMock.mock.calls.length, 1);
  const info = logMock.mock.calls[0].arguments[0];
  assert.equal(info.namespace, "alpha");

  logMock.mock.restore();
  configMock.mock.restore();
  t.mock.restoreAll();
});

test("inspect logs formatted object at debug level", async (t) => {
  const configMock = t.mock.method(dotenv, "config", () => ({}));
  const logger = await loadLogger();
  const logMock = t.mock.method(logger.default.transports[0], "log");
  const prevLevel = logger.default.level;
  logger.default.level = "debug";

  const obj = { a: 1, b: { c: [2, 3] } };
  const inspected = util.inspect(obj, { depth: null });
  logger.inspect(obj);

  assert.equal(logMock.mock.calls.length, 1);
  const info = logMock.mock.calls[0].arguments[0];
  assert.equal(info.level, "debug");
  assert.equal(info.message, inspected);

  logger.default.level = prevLevel;
  logMock.mock.restore();
  configMock.mock.restore();
  t.mock.restoreAll();
});

test("format printf includes namespace and metadata", async (t) => {
  const configMock = t.mock.method(dotenv, "config", () => ({}));
  const logger = await loadLogger();
  const logMock = t.mock.method(logger.default.transports[0], "log");

  const child = logger.named("alpha");
  child.info("test log", { beta: 2 });

  assert.equal(logMock.mock.calls.length, 1);
  const info = logMock.mock.calls[0].arguments[0];
  const output = info[Symbol.for("message")];
  assert.match(output, /alpha/);
  assert.match(output, /"beta":2/);

  logMock.mock.restore();
  configMock.mock.restore();
  t.mock.restoreAll();
});

test("logger uses LOG_LEVEL from env", async (t) => {
  const prev = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = "warn";
  const configMock = t.mock.method(dotenv, "config", () => ({}));
  const logger = await loadLogger();

  assert.equal(logger.default.isLevelEnabled("debug"), false);
  assert.equal(logger.default.isLevelEnabled("warn"), true);

  configMock.mock.restore();
  t.mock.restoreAll();
  if (prev === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = prev;
  }
});

test("named delegates levels with namespace prefixes", async (t) => {
  const configMock = t.mock.method(dotenv, "config", () => ({}));
  const logger = await loadLogger();
  const logMock = t.mock.method(logger.default.transports[0], "log");

  const alpha = logger.named("alpha");
  const beta = logger.named("beta");

  alpha.info("one");
  beta.warn("two");
  beta.error("three");

  assert.equal(logMock.mock.calls.length, 3);
  const [info, warn, error] = logMock.mock.calls.map(c => c.arguments[0]);
  assert.equal(info.namespace, "alpha");
  assert.match(info[Symbol.for("message")], /\[info\] alpha one/);
  assert.equal(warn.namespace, "beta");
  assert.match(warn[Symbol.for("message")], /\[warn\] beta two/);
  assert.equal(error.namespace, "beta");
  assert.match(error[Symbol.for("message")], /\[error\] beta three/);

  logMock.mock.restore();
  configMock.mock.restore();
  t.mock.restoreAll();
});

test("silent mode suppresses logging", async (t) => {
  const configMock = t.mock.method(dotenv, "config", () => ({}));
  const logger = await loadLogger();
  const logMock = t.mock.method(logger.default.transports[0], "log");

  const child = logger.named("alpha");
  logger.default.silent = true;
  child.info("quiet");
  assert.equal(logMock.mock.calls.length, 0);

  logger.default.silent = false;
  child.error("loud");
  assert.equal(logMock.mock.calls.length, 1);

  logger.default.silent = false;
  logMock.mock.restore();
  configMock.mock.restore();
  t.mock.restoreAll();
});

