import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { dome } from "../../src/client/b-variables.js";
import { initClient } from "../../src/client/z-setup.js";

const setupDom = (t) => {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="browser-client"></div>
    <div id="lineBuffer" class="standardText"></div>
    <div id="gameHealth"></div>
    <div id="gameHealthDetail"></div>
    <div id="statusMsg"></div>
    <div id="editor-list-view"></div>
    <input id="inputBuffer" />
    <button id="button-reconnect"></button>
    <button id="button-save"></button>
    <button id="button-save-mini"></button>
    <button id="button-auto-scroll"></button>
    <button id="button-clear-buffer"></button>
    <button id="button-shortcuts"></button>
    <div id="shortcuts-overlay"></div>
    <button id="button-client-options"></button>
    <button id="button-client-options-close"></button>
    <div id="client-options-overlay"></div>
    <div id="perf-buffer-flag"></div>
    <div id="disconnect-overlay"></div>
    <div class="disconnect-buttons"></div>
  </body></html>`, { pretendToBeVisual: true, url: "https://example.com/" });
  const { window } = dom;
  const orig = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = window.document;
  t?.after(() => {
    globalThis.window = orig.window;
    globalThis.document = orig.document;
  });
  return window;
};

test("z-setup replaces existing socket and binds data handler", async t => {
  const window = setupDom(t);
  t.mock.method(window, "setTimeout", fn => { fn(); return 1; });

  const oldSocket = { old: true };
  dome.socket = oldSocket;
  const onCalls = [];
  dome.readPreferences = () => ({ lineBufferFont: "standard", colorSet: "normal", commandSuggestions: false });
  dome.parseSocketData = () => {};
  const setupOutputParser = t.mock.fn();
  const features = {
    setupAutoCompleteFeature: () => {},
    setupInputReader: () => {},
    setupWindowHandlers: () => {},
    setupEditorSupport: () => {},
    setupAutoscroll: () => {},
    setupButtons: () => {},
    setupChevronToggle: () => {},
    setupHealthCheck: () => {},
    setupOutputParser,
    setupSocket: () => ({ on: (...args) => { onCalls.push(args); } })
  };

  initClient({ client: dome, win: window, doc: window.document, features });

  assert.equal(dome.clientOptionsButton, window.document.querySelector("#button-client-options"));
  assert.equal(dome.clientOptionsOverlay, window.document.querySelector("#client-options-overlay"));
  assert.notEqual(dome.socket, oldSocket);
  assert.equal(onCalls[0][0], "data");
  assert.equal(onCalls[0][1], dome.parseSocketData);
  assert.equal(setupOutputParser.mock.calls.length, 1);
});

test("z-setup surfaces setupSocket errors", async t => {
  const window = setupDom(t);
  t.mock.method(window, "setTimeout", fn => { fn(); });

  dome.readPreferences = () => ({ lineBufferFont: "standard", colorSet: "normal", commandSuggestions: false });
  const features = {
    setupAutoCompleteFeature: () => {},
    setupInputReader: () => {},
    setupWindowHandlers: () => {},
    setupEditorSupport: () => {},
    setupAutoscroll: () => {},
    setupButtons: () => {},
    setupChevronToggle: () => {},
    setupHealthCheck: () => {},
    setupOutputParser: () => {},
    setupSocket: () => { throw new Error("boom"); }
  };

  assert.throws(() => {
    initClient({ client: dome, win: window, doc: window.document, features });
  }, /boom/);
});
