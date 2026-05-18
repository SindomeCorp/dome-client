/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import { sessionError } from "../../src/controllers/session-error.js";

async function loadAuth(t, logger) {
  const loggerMock = t.mock.module("../../src/logger.js", {
    namedExports: {
      named: () => (logger || { info() {}, error() {}, warn() {}, debug() {} })
    }
  });
  const mod = await import(`../../src/controllers/auth.js?c=${Date.now()}`);
  loggerMock.restore();
  return mod;
}

test("sessionError populates req.session.error", () => {
  const req = { session: {} };
  sessionError(req, "boom");
  assert.strictEqual(req.session.error, "boom");
});

test("sessionError throws without session", () => {
  assert.throws(() => {
    sessionError({}, "boom");
  }, TypeError);
});

test("auth controller exports login", async t => {
  const mod = await loadAuth(t);
  assert.equal(typeof mod.login, "function");
});
