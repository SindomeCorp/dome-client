import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
/* global document */
import { dome } from "../../src/client/b-variables.js";

// Test that z-setup initializes DOM references and calls setup functions

test("z-setup assigns DOM references and invokes setup hooks", async t => {
  // Create minimal DOM
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
  </body></html>`, { pretendToBeVisual: true });

  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  const originalSetTimeout = globalThis.setTimeout;
  t.mock.method(window, "setTimeout", fn => {
    fn();
    return 1;
  });
  globalThis.setTimeout = window.setTimeout;
  t.after(() => {
    globalThis.setTimeout = originalSetTimeout;
  });
  // stub preferences and setup functions
  const calls = [];
  dome.readPreferences = () => ({
    lineBufferFont: "lucida",
    colorSet: "dim",
    commandSuggestions: true
  });
  dome.autoComplete = () => { calls.push("autoComplete"); };

  const stub = name => {
    dome[name] = () => {
      calls.push(name);
      if (name === "setupSocket") return { on: () => {} };
    };
  };
  const setups = [
    "setupInputReader",
    "setupAutoComplete",
    "setupWindowHandlers",
    "setupEditorSupport",
    "setupAutoscroll",
    "setupButtons",
    "setupHealthCheck",
    "setupOutputParser",
    "setupSocket"
  ];
  setups.forEach(stub);
  dome.parseSocketData = () => {};

  await import("../../src/client/z-setup.js");

  // verify setup functions called
  setups.forEach(name => assert.ok(calls.includes(name), `${name} was called`));

  // verify DOM references assigned
  assert.equal(dome.client, document.querySelector("#browser-client"));
  assert.equal(dome.buffer, document.querySelector("#lineBuffer"));
  assert.ok(!dome.buffer.classList.contains("standardText"));
  assert.ok(dome.buffer.classList.contains("lucidaText"));
  assert.ok(dome.buffer.classList.contains("colorset-dim"));
  assert.equal(dome.healthDisplay, document.querySelector("#gameHealth"));
  assert.equal(dome.healthDetail, document.querySelector("#gameHealthDetail"));
  assert.equal(dome.statusDisplay, document.querySelector("#statusMsg"));
  assert.equal(dome.editorListView, document.querySelector("#editor-list-view"));
  assert.equal(dome.inputReader, document.querySelector("#inputBuffer"));
  assert.equal(dome.reconnectButton, document.querySelector("#button-reconnect"));
  assert.equal(dome.saveButton.length, 2);
  assert.equal(dome.scrollButton, document.querySelector("#button-auto-scroll"));
  assert.equal(dome.clearButton, document.querySelector("#button-clear-buffer"));
  assert.equal(dome.shortcutsButton, document.querySelector("#button-shortcuts"));
  assert.equal(dome.shortcutsOverlay, document.querySelector("#shortcuts-overlay"));
  assert.equal(dome.clientOptionsButton, document.querySelector("#button-client-options"));
  assert.equal(dome.clientOptionsOverlay, document.querySelector("#client-options-overlay"));
  assert.equal(dome.clientOptionsClose, document.querySelector("#button-client-options-close"));
  assert.equal(dome.perfBufferFlag, document.querySelector("#perf-buffer-flag"));
  assert.equal(dome.disconnectView.overlay, document.querySelector("#disconnect-overlay"));
  assert.equal(dome.disconnectView.buttonGroup, document.querySelector(".disconnect-buttons"));

  // verify socket assigned
  assert.ok(dome.socket);

});

