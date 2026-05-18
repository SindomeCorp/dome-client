import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { dome } from "../../src/client/b-variables.js";

const prefUrl = new URL("../../src/client/c-preferences.js", import.meta.url);

test("setClientOption broadcasts editorFont", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://example.com" });
  const { window } = dom;
  window.dome = dome;
  const orig = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    localStorage: globalThis.localStorage,
    dome: globalThis.dome
  };
  Object.defineProperty(globalThis, "window", { value: window, configurable: true, writable: true });
  Object.defineProperty(globalThis, "document", { value: window.document, configurable: true, writable: true });
  Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true, writable: true });
  Object.defineProperty(globalThis, "localStorage", { value: window.localStorage, configurable: true, writable: true });
  global.dome = dome;
  t.after(() => {
    Object.defineProperty(globalThis, "window", { value: orig.window, configurable: true, writable: true });
    Object.defineProperty(globalThis, "document", { value: orig.document, configurable: true, writable: true });
    Object.defineProperty(globalThis, "navigator", { value: orig.navigator, configurable: true, writable: true });
    Object.defineProperty(globalThis, "localStorage", { value: orig.localStorage, configurable: true, writable: true });
    global.dome = orig.dome;
  });
  await import(prefUrl);
  const messages = [];
  dome.spawned = { a: { postMessage: (msg) => messages.push(msg) } };
  dome.ideWindow = { postMessage: (msg) => messages.push(msg) };
  dome.preferences = dome.readPreferences();
  dome.setClientOption("editorFont", "lucida");
  assert.equal(dome.preferences.editorFont, "lucida");
  assert.ok(messages.some((m) => m.type === "set-editor-font" && m.font === "lucida"));
  assert.ok(messages.some((m) => m.type === "ide-set-font" && m.font === "lucida"));
});
