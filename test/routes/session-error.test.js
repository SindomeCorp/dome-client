/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import { sessionError } from "../../src/controllers/session-error.js";

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
