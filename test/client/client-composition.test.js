import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  createClientFeatureSet,
  initClient
} from "../../src/client/core/bootstrap.js";

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
  const features = {
    setupAutoCompleteFeature: (args) => {
      calls.push("setupAutoCompleteFeature");
      assert.equal(args.capabilities.inputReader, window.document.querySelector("#inputBuffer"));
    },
    setupInputReader: (args) => {
      calls.push("setupInputReader");
      assert.equal(args.capabilities.userType, "p");
    },
    setupWindowHandlers: (args) => {
      calls.push("setupWindowHandlers");
      assert.equal(args.capabilities.buttons.reconnect, window.document.querySelector("#button-reconnect"));
    },
    setupEditorSupport: (args) => {
      calls.push("setupEditorSupport");
      assert.equal(args.capabilities.listView, window.document.querySelector("#editor-list-view"));
    },
    setupAutoscroll: (args) => {
      calls.push("setupAutoscroll");
      assert.equal(args.capabilities.buttons.scroll, window.document.querySelector("#button-auto-scroll"));
    },
    setupButtons: (args) => {
      calls.push("setupButtons");
      assert.equal(args.capabilities.overlays.clientOptions, window.document.querySelector("#client-options-overlay"));
    },
    setupChevronToggle: (args) => {
      calls.push("setupChevronToggle");
      assert.equal(args.capabilities.buttons.clear, window.document.querySelector("#button-clear-buffer"));
    },
    setupHealthCheck: (args) => {
      calls.push("setupHealthCheck");
      assert.equal(args.capabilities.display, window.document.querySelector("#gameHealth"));
    },
    setupOutputParser: (args) => {
      calls.push("setupOutputParser");
      assert.equal(args.capabilities.buffer, window.document.querySelector("#lineBuffer"));
    },
    setupSocket: () => {
      calls.push("setupSocket");
      return socket;
    }
  };
  window.setTimeout = fn => {
    fn();
    return 1;
  };

  initClient({ client, win: window, doc: window.document, features });

  assert.deepEqual(calls.slice(0, 9), [
    "setupAutoCompleteFeature",
    "setupInputReader",
    "setupWindowHandlers",
    "setupEditorSupport",
    "setupAutoscroll",
    "setupButtons",
    "setupChevronToggle",
    "setupHealthCheck",
    "setupOutputParser"
  ]);
  assert.equal(calls[9], "setupSocket");
  assert.deepEqual(calls[10], ["socket.on", "data", client.parseSocketData]);
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
    setupSocket: () => {
      throw new Error("browser socket should not start");
    }
  };

  initClient({ client, win: window, doc: window.document, features });
  window.DomeBridge.sendInput("look");
  client.socket.emit("input", "say hi");

  assert.deepEqual(sent, ["ready", "look", "say hi"]);
  assert.equal(client.socketState, 1);
});

test("createClientFeatureSet exposes directly imported setup features", () => {
  const features = createClientFeatureSet();

  assert.equal(typeof features.setupButtons, "function");
  assert.equal(typeof features.setupChevronToggle, "function");
  assert.equal(typeof features.setupEditorSupport, "function");
  assert.equal(typeof features.setupWindowHandlers, "function");
  assert.equal(typeof features.setupAutoscroll, "function");
  assert.equal(typeof features.setupOutputParser, "function");
  assert.equal(typeof features.setupAutoCompleteFeature, "function");
  assert.equal(typeof features.setupInputReader, "function");
  assert.equal(typeof features.setupHealthCheck, "function");
  assert.equal(typeof features.setupSocket, "function");
});
