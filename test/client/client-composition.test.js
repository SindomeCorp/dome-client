import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  createClientFeatureSet,
  createClientSetupHooks,
  initClient
} from "../../src/client/z-setup.js";

const setupCompositionDom = () => {
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
    <div id="clear-buffer-overlay"></div>
    <button id="button-clear-buffer-confirm"></button>
    <button id="button-clear-buffer-cancel"></button>
    <button id="button-shortcuts"></button>
    <div id="shortcuts-overlay"></div>
    <button id="button-client-options"></button>
    <button id="button-client-options-close"></button>
    <div id="client-options-overlay"></div>
    <div id="perf-buffer-flag"></div>
    <div id="disconnect-overlay"></div>
    <div class="disconnect-buttons"></div>
  </body></html>`, { pretendToBeVisual: true, url: "https://example.com/" });
  return dom.window;
};

test("initClient composes setup hooks with explicit client context", () => {
  const window = setupCompositionDom();
  const calls = [];
  const socket = { on: (event, handler) => calls.push(["socket.on", event, handler]) };
  const client = {
    readPreferences: () => ({
      lineBufferFont: "standard",
      colorSet: "normal",
      commandSuggestions: false
    }),
    parseSocketData: () => {}
  };
  const hooks = {
    setupInputReader: () => calls.push("setupInputReader"),
    setupAutoComplete: () => calls.push("setupAutoComplete"),
    setupWindowHandlers: () => calls.push("setupWindowHandlers"),
    setupEditorSupport: () => calls.push("setupEditorSupport"),
    setupAutoscroll: () => calls.push("setupAutoscroll"),
    setupHealthCheck: () => calls.push("setupHealthCheck"),
    setupOutputParser: () => calls.push("setupOutputParser"),
    setupSocket: () => {
      calls.push("setupSocket");
      return socket;
    }
  };
  const features = {
    setupButtons: () => calls.push("setupButtons"),
    setupChevronToggle: () => calls.push("setupChevronToggle")
  };
  window.setTimeout = fn => {
    fn();
    return 1;
  };

  initClient({ client, win: window, doc: window.document, hooks, features });

  assert.deepEqual(calls.slice(0, 8), [
    "setupInputReader",
    "setupWindowHandlers",
    "setupEditorSupport",
    "setupAutoscroll",
    "setupButtons",
    "setupChevronToggle",
    "setupHealthCheck",
    "setupOutputParser"
  ]);
  assert.equal(calls[8], "setupSocket");
  assert.deepEqual(calls[9], ["socket.on", "data", client.parseSocketData]);
  assert.equal(client.client, window.document.querySelector("#browser-client"));
  assert.equal(client.inputReader, window.document.querySelector("#inputBuffer"));
  assert.equal(typeof window.DomeBridge.sendInput, "function");
});

test("initClient installs native socket shim when DomeNative is available", () => {
  const window = setupCompositionDom();
  const sent = [];
  window.DomeNative = {
    sendInput: payload => sent.push(payload),
    bridgeReady: () => sent.push("ready")
  };
  const client = {
    readPreferences: () => ({
      lineBufferFont: "standard",
      colorSet: "normal",
      commandSuggestions: false
    }),
    parseSocketData: () => {}
  };
  const hooks = {
    setupInputReader: () => {},
    setupAutoComplete: () => {},
    setupWindowHandlers: () => {},
    setupEditorSupport: () => {},
    setupAutoscroll: () => {},
    setupHealthCheck: () => {},
    setupOutputParser: () => {},
    setupSocket: () => {
      throw new Error("browser socket should not start");
    }
  };
  const features = {
    setupButtons: () => {},
    setupChevronToggle: () => {}
  };

  initClient({ client, win: window, doc: window.document, hooks, features });
  window.DomeBridge.sendInput("look");
  client.socket.emit("input", "say hi");

  assert.deepEqual(sent, ["ready", "look", "say hi"]);
  assert.equal(client.socketState, 1);
});

test("createClientSetupHooks delegates to current client methods", () => {
  const calls = [];
  const client = {
    setupInputReader: () => calls.push("input"),
    setupSocket: () => "socket"
  };
  const hooks = createClientSetupHooks(client);

  hooks.setupInputReader();

  assert.equal(hooks.setupSocket(), "socket");
  assert.deepEqual(calls, ["input"]);
});

test("createClientFeatureSet exposes directly imported setup features", () => {
  const features = createClientFeatureSet();

  assert.equal(typeof features.setupButtons, "function");
  assert.equal(typeof features.setupChevronToggle, "function");
});
