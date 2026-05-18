/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";

import config from "../../src/config/index.js";

export function getEnv() {
  return config.node;
}

test("config/env loads node configuration", () => {
  assert.equal(typeof getEnv(), "object");
});
