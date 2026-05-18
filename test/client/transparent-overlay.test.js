/* global document */
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { dome } from "../../src/client/b-variables.js";

// Ensure transparent overlay class applied after async setupAutoComplete

const domHtml = `<!doctype html><html><body>
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
</body></html>`;

test("z-setup applies transparent overlay after async autocomplete setup", async (t) => {
  const dom = new JSDOM(domHtml, { pretendToBeVisual: true });
  const { window } = dom;
  const orig = { window: globalThis.window, document: globalThis.document, setTimeout: globalThis.setTimeout };
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.setTimeout = (fn) => { fn(); return 1; };
  t.after(() => {
    globalThis.window = orig.window;
    globalThis.document = orig.document;
    globalThis.setTimeout = orig.setTimeout;
  });

  dome.readPreferences = () => ({ transparentOverlay: true, commandSuggestions: true });
  dome.autoComplete = () => {};
  dome.setupInputReader = () => {};
  dome.setupWindowHandlers = () => {};
  dome.setupEditorSupport = () => {};
  dome.setupAutoscroll = () => {};
  dome.setupButtons = () => {};
  dome.setupChevronToggle = () => {};
  dome.setupHealthCheck = () => {};
  dome.setupOutputParser = () => {};
  dome.setupSocket = () => ({ on: () => {} });
  dome.parseSocketData = () => {};

  dome.setupAutoComplete = () => new Promise((resolve) => {
    Promise.resolve().then(() => {
      const ac = document.createElement("div");
      ac.className = "ui-autocomplete ui-opaque-overlay";
      document.body.appendChild(ac);
      resolve();
    });
  });

  await import("../../src/client/z-setup.js");
  await Promise.resolve();
  const ac = document.querySelector(".ui-autocomplete");
  assert.ok(ac.classList.contains("ui-transparent-overlay"));
  assert.ok(!ac.classList.contains("ui-opaque-overlay"));
});
