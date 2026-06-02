/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
/* global document */
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createClientState } from "../src/client/client-state.js";
import { setupClientPreferences } from "../src/client/c-preferences.js";

// Typing @client-options should display preferences without a server response.
test("@client-options prints preferences locally", async (t) => {
  const dome = createClientState();
  const dom = new JSDOM("<input id=\"input\" />", { pretendToBeVisual: true, url: "https://example.com/" });
  const { window } = dom;
  const orig = {
    window: globalThis.window,
    document: globalThis.document,
    localStorage: globalThis.localStorage,
    store: globalThis.store
  };
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.localStorage = window.localStorage;
  t.after(() => {
    globalThis.window = orig.window;
    globalThis.document = orig.document;
    globalThis.localStorage = orig.localStorage;
    if (orig.store === undefined) {
      delete globalThis.store;
    } else {
      globalThis.store = orig.store;
    }
  });
  window.FONT_CHOICES = ["standard"];
  window.EDIT_THEMES = ["twilight"];
  window.COLORSET_CHOICES = ["acid"];

  const output = [];
  let scrolled = false;
  Object.assign(dome, {
    inputReader: document.querySelector("#input"),
    buffer: {
      insertAdjacentHTML: (pos, text) => output.push(text),
      append: (text) => output.push(text)
    },
    preferences: { commandSuggestions: true }
  });
  globalThis.store = { get: () => [], put() {} };
  let emitted = false;
  dome.socket = { emit: () => { emitted = true; } };

  setupClientPreferences({ client: dome, doc: window.document, win: window });
  const { setupInputReader } = await import("../src/client/d-inputreader.js");
  dome.scrollBuffer = () => { scrolled = true; };

  setupInputReader({ client: dome, doc: window.document });

  dome.inputReader.value = "@client-options";
  dome.inputReader.dispatchEvent(new window.KeyboardEvent("keypress", { key: "Enter", shiftKey: false }));

  assert.ok(output.some((line) => line.includes("commandSuggestions")));
  assert.ok(!emitted);
  assert.ok(scrolled);
});
