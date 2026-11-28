import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { JSDOM } from "jsdom";
import { COLORSET_CHOICES } from "../../src/shared/client-options.js";

function setGlobal(t, key, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, key, previous);
    else delete globalThis[key];
  });
}

async function createPage(t, html) {
  const { window } = new JSDOM(html, { url: "https://fixture.invalid/" });
  t.after(() => window.close());
  // Leave the fixture in control of the DOMContentLoaded dispatches.
  await setImmediate();
  setGlobal(t, "window", window);
  setGlobal(t, "document", window.document);
  return window;
}

test("standalone Options initializes profiles and saved number fields once", async (t) => {
  const window = await createPage(t, `<!doctype html><html><body>
    <div id="context-menu-active"></div>
    <div class="client-options-page">
      <div class="option-row" id="buffer-option"><input type="number"></div>
    </div>
  </body></html>`);
  const { document } = window;
  const options = await import("../../src/client/entrypoints/client-options.js?standalone-entry");
  const read = t.mock.method(options.store, "get", key => key === "dc-toggle-buffer" ? 42 : null);
  const saveOption = t.mock.fn();
  options.setClientOptionsActions({ setClientOption: saveOption });

  document.dispatchEvent(new window.Event("DOMContentLoaded"));
  document.dispatchEvent(new window.Event("DOMContentLoaded"));

  assert.equal(window.COLORSET_CHOICES, COLORSET_CHOICES);
  assert.equal(document.querySelector("#context-menu-active").textContent, "Active Profile: Player (Fallback)");
  assert.equal(document.body.style.overflowY, "auto");
  assert.equal(document.body.style.scrollbarWidth, "none");
  assert.equal(document.body.style.msOverflowStyle, "none");
  assert.equal([...document.head.querySelectorAll("style")].filter(style =>
    style.textContent.includes("::-webkit-scrollbar")).length, 1);
  assert.equal(read.mock.calls.filter(({ arguments: [key] }) => key === "dc-toggle-buffer").length, 1);

  const input = document.querySelector("#buffer-option input");
  assert.equal(input.value, "42");
  input.value = "81";
  input.dispatchEvent(new window.Event("change"));
  assert.deepEqual(saveOption.mock.calls.map(({ arguments: args }) => args), [
    ["performanceBuffer", 81, { source: "ui" }]
  ]);
});

test("the player Options entry preserves the active terminal controls and supplied colors", async (t) => {
  const window = await createPage(t, `<!doctype html><html><body>
    <div id="output-workspace"></div>
    <div id="context-menu-active">Active Profile: GM (selected by server)</div>
  </body></html>`);
  const assigned = ["fixture colors"];
  window.COLORSET_CHOICES = assigned;
  await import("../../src/client/entrypoints/client-options.js?player-entry");
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  assert.equal(window.COLORSET_CHOICES, assigned);
  assert.equal(window.document.querySelector("#context-menu-active").textContent, "Active Profile: GM (selected by server)");
});

test("the Options entry can be imported without a complete browser environment", async (t) => {
  setGlobal(t, "window", undefined);
  setGlobal(t, "document", undefined);
  const options = await import("../../src/client/entrypoints/client-options.js?node-entry");
  assert.equal(options.COLORSET_CHOICES, COLORSET_CHOICES);

  globalThis.window = { COLORSET_CHOICES };
  const partial = await import("../../src/client/entrypoints/client-options.js?window-only");
  assert.equal(partial.COLORSET_CHOICES, COLORSET_CHOICES);
});
