import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createClientOptionsController } from "../../src/client/client-options-controller.js";
import { createClientOptionsStore } from "../../src/client/client-options-store.js";

function createMapStorage() {
  const data = new Map();
  return {
    data,
    get(key) {
      return data.has(key) ? data.get(key) : null;
    },
    put(key, value) {
      data.set(key, value);
    }
  };
}

test("client options controller writes by key, param, and preference name through one boundary", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://example.com/" });
  const storage = createMapStorage();
  const options = createClientOptionsStore({ storage });
  const client = { buffer: { append() {} }, preferences: {} };
  const controller = createClientOptionsController({
    client,
    doc: dom.window.document,
    win: dom.window,
    storage,
    options
  });
  client.preferences = controller.readPreferences();

  const byKey = controller.setOption("localecho", true, { source: "ui" });
  const byParam = controller.setOption("le", false, { source: "command" });
  const byPreference = controller.setOption("localEcho", true, { source: "import" });

  assert.equal(byKey.status, "changed");
  assert.equal(byKey.preferenceName, "localEcho");
  assert.equal(byParam.status, "changed");
  assert.equal(byPreference.status, "changed");
  assert.equal(client.preferences.localEcho, true);
  assert.equal(storage.get("dc-toggle-localecho"), true);
});

test("client options controller rejects invalid values without mutating preferences or storage", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://example.com/" });
  const storage = createMapStorage();
  const options = createClientOptionsStore({ storage });
  const client = { buffer: { append() {} }, preferences: {} };
  const controller = createClientOptionsController({
    client,
    doc: dom.window.document,
    win: dom.window,
    storage,
    options
  });
  client.preferences = controller.readPreferences();

  const result = controller.setOption("lineBufferFontSizePt", 100, { source: "command" });

  assert.equal(result.ok, false);
  assert.equal(result.status, "invalid-value");
  assert.equal(client.preferences.lineBufferFontSizePt, 9.75);
  assert.equal(storage.get("dc-toggle-outfontsize"), null);
});
