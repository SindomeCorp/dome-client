import { test } from "node:test";
import assert from "node:assert/strict";

test("sets exported constants", async (t) => {
  const moduleUrl = new URL("../../src/client/b-variables.js", import.meta.url).href;

  const orig = { dome: globalThis.dome, specialHeightOffset: globalThis.specialHeightOffset };
  t.after(() => {
    if (orig.dome === undefined) {
      delete globalThis.dome;
    } else {
      globalThis.dome = orig.dome;
    }
    if (orig.specialHeightOffset === undefined) {
      delete globalThis.specialHeightOffset;
    } else {
      globalThis.specialHeightOffset = orig.specialHeightOffset;
    }
  });

  delete globalThis.dome;
  globalThis.specialHeightOffset = 123;
  const mod1 = await import(`${moduleUrl}?override`);
  assert.equal(mod1.defaultHeightOffset, 50);

  delete globalThis.specialHeightOffset;
  const mod2 = await import(`${moduleUrl}?default`);
  assert.equal(mod2.defaultHeightOffset, 50);

  assert.deepEqual(mod2.MOO_STATUS_ENUM, {
    UNCHECKED: "UNCHECKED",
    UNKNOWN: "UNKNOWN",
    OK: "OK",
    WEBCLIENT_DOWN: "CLIENT_DOWN",
    WEBSITE_DOWN: "SITE_DOWN",
    MOO_OFFLINE: "MOO_DOWN",
    SEVERE_LAG: "LAG",
    NETWORK_ISSUE: "NETWORK"
  });

  assert.deepEqual(mod2.SOCKET_STATE_ENUM, {
    RECONNECT_FAILED: -1,
    DISCONNECTED: 0,
    CONNECTED: 1,
    BEFORE_FIRST: 2
  });

  const loggerMod = await import("../../src/client/pages/logger.js");
  assert.equal(mod2.logger, loggerMod.default);
  ["debug", "info", "warn", "error"].forEach((m) => {
    assert.equal(typeof mod2.logger[m], "function");
  });

  assert.strictEqual(globalThis.dome, undefined);
});

test("setSocket overwrites existing socket", async () => {
  const moduleUrl = new URL("../../src/client/b-variables.js", import.meta.url).href;
  const mod = await import(`${moduleUrl}?set-socket`);

  const mockSocket1 = {};
  mod.setSocket(mockSocket1);
  assert.strictEqual(mod.socket, mockSocket1);

  const mockSocket2 = {};
  mod.setSocket(mockSocket2);
  assert.strictEqual(mod.socket, mockSocket2);
  assert.notStrictEqual(mod.socket, mockSocket1);
});

