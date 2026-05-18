/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import { test } from "node:test";
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import dotenv from "dotenv";
const envUrl = new URL("../../src/env.js", import.meta.url);

test("uses git hash from command when GIT_HASH unset", async (t) => {
  const prevHash = process.env.GIT_HASH;
  const prevLevel = process.env.LOG_LEVEL;
  delete process.env.GIT_HASH;
  delete process.env.LOG_LEVEL;

  const execMock = t.mock.method(childProcess, "execSync", () =>
    Buffer.from("cafebabe\n")
  );
  const configMock = t.mock.method(dotenv, "config", () => ({}));
  const env = (await import(`${envUrl.href}?${Date.now()}`)).default;

  assert.equal(env.GIT_HASH, "cafebabe");
  assert.equal(process.env.GIT_HASH, "cafebabe");
  assert.equal(process.env.LOG_LEVEL, "info");
  assert.equal(execMock.mock.calls.length, 1);
  assert.deepEqual(execMock.mock.calls[0].arguments, [
    "git log --format=\"%H\" --max-count=1 less/*"
  ]);

  execMock.mock.restore();
  configMock.mock.restore();
  t.mock.restoreAll();
  if (prevHash === undefined) {
    delete process.env.GIT_HASH;
  } else {
    process.env.GIT_HASH = prevHash;
  }
  if (prevLevel === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = prevLevel;
  }
});

test("returns empty git hash and sets default log level when command fails", async (t) => {
  const prevHash = process.env.GIT_HASH;
  const prevLevel = process.env.LOG_LEVEL;
  delete process.env.GIT_HASH;
  delete process.env.LOG_LEVEL;

  const execMock = t.mock.method(childProcess, "execSync", () => {
    throw new Error("fail");
  });
  const configMock = t.mock.method(dotenv, "config", () => ({}));
  const env = (await import(`${envUrl.href}?${Date.now()}`)).default;

  assert.equal(env.GIT_HASH, "");
  assert.equal(env.LOG_LEVEL, "info");
  assert.equal(process.env.GIT_HASH, "");
  assert.equal(process.env.LOG_LEVEL, "info");
  assert.equal(execMock.mock.calls.length, 1);

  execMock.mock.restore();
  configMock.mock.restore();
  t.mock.restoreAll();
  if (prevHash === undefined) {
    delete process.env.GIT_HASH;
  } else {
    process.env.GIT_HASH = prevHash;
  }
  if (prevLevel === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = prevLevel;
  }
});

test("uses provided GIT_HASH without calling git command", async (t) => {
  const prevHash = process.env.GIT_HASH;
  const prevLevel = process.env.LOG_LEVEL;
  process.env.GIT_HASH = "deadbeef";
  delete process.env.LOG_LEVEL;

  const execMock = t.mock.method(childProcess, "execSync", () => "cafebabe");
  const configMock = t.mock.method(dotenv, "config", () => ({}));
  const env = (await import(`${envUrl.href}?${Date.now()}`)).default;

  assert.equal(env.GIT_HASH, "deadbeef");
  assert.equal(process.env.GIT_HASH, "deadbeef");
  assert.equal(process.env.LOG_LEVEL, "info");
  assert.equal(execMock.mock.calls.length, 0);

  execMock.mock.restore();
  configMock.mock.restore();
  t.mock.restoreAll();
  if (prevHash === undefined) {
    delete process.env.GIT_HASH;
  } else {
    process.env.GIT_HASH = prevHash;
  }
  if (prevLevel === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = prevLevel;
  }
});

test("honors LOG_LEVEL and defaults to info", async (t) => {
  const prev = process.env.LOG_LEVEL;
  delete process.env.LOG_LEVEL;

  const configMock = t.mock.method(dotenv, "config", () => ({}));
  let env = (await import(`${envUrl.href}?${Date.now()}`)).default;
  assert.equal(env.LOG_LEVEL, "info");
  assert.equal(process.env.LOG_LEVEL, "info");

  process.env.LOG_LEVEL = "debug";
  env = (await import(`${envUrl.href}?${Date.now()}`)).default;
  assert.equal(env.LOG_LEVEL, "debug");
  assert.equal(process.env.LOG_LEVEL, "debug");

  configMock.mock.restore();
  t.mock.restoreAll();
  if (prev === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = prev;
  }
});

