import { test } from "node:test";
import assert from "node:assert/strict";
import { setupClientOptionsDom } from "./index.js";

test("client-options updates state and persists to store", async () => {
  const html = `<!doctype html><html><body>
  <div class="client-options-page">
    <div class="option-row" id="commands-option">
      <button class="enabled-state btn-primary" data-val="true">on</button>
      <button class="disabled-state" data-val="false">off</button>
    </div>
    <div class="option-row" id="scrolluppause-option">
      <button class="enabled-state" data-val="true">on</button>
      <button class="disabled-state btn-primary" data-val="false">off</button>
    </div>
    <div class="option-row" id="scroll-option">
      <select>
        <option value="dbl">dbl</option>
        <option value="none">none</option>
      </select>
    </div>
  </div>
  </body></html>`;
  const { window } = setupClientOptionsDom(html);
  const data = new Map();
  const store = {
    get(key) {
      return data.has(key) ? data.get(key) : null;
    },
    put(key, value) {
      data.set(key, value);
    }
  };
  const options = await import("../../src/client/pages/client-options.js");
  Object.assign(options.store, store);
  const { clientOptions } = options;
  clientOptions.options = {
    commands: { param: "cs", def: true, ok: [true, false] },
    scrolluppause: { param: "up", def: false, ok: [true, false] },
    scroll: { param: "as", def: "dbl", ok: ["dbl", "long", "none"] }
  };
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  const offBtn = window.document.querySelector("#commands-option .disabled-state");
  offBtn.click();
  assert.equal(store.get("dc-toggle-commands"), false);
  assert.equal(clientOptions.get("commands").state, false);
  const scrollUpOnBtn = window.document.querySelector("#scrolluppause-option .enabled-state");
  scrollUpOnBtn.click();
  assert.equal(store.get("dc-toggle-scrolluppause"), true);
  assert.equal(clientOptions.get("scrolluppause").state, true);
  const select = window.document.querySelector("#scroll-option select");
  select.value = "none";
  select.dispatchEvent(new window.Event("change"));
  assert.equal(store.get("dc-toggle-scroll"), "none");
  assert.equal(clientOptions.get("scroll").state, "none");
});

test("clientOptions throws on invalid option", async () => {
  const html = "<!doctype html><html><body><div class=\"client-options-page\"></div></body></html>";
  const { window, store } = setupClientOptionsDom(html);
  const options = await import("../../src/client/pages/client-options.js");
  Object.assign(options.store, store);
  const { clientOptions } = options;
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  assert.throws(() => clientOptions.get("nope"), /invalid option name/);
  assert.throws(() => clientOptions.save("nope", true), /invalid option name/);
});

test("clientOptions query string includes scroll up to pause", async () => {
  const html = "<!doctype html><html><body><div class=\"client-options-page\"></div></body></html>";
  const { window, store } = setupClientOptionsDom(html);
  const options = await import("../../src/client/pages/client-options.js?scrolluppause");
  Object.assign(options.store, store);
  const { clientOptions } = options;
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  clientOptions.save("scrolluppause", true);
  assert.ok(clientOptions.buildQueryString().includes("up=true"));
});

test("client options tabs show one panel at a time", async () => {
  const html = `<!doctype html><html><body>
  <div class="client-options-page">
    <button class="client-options-tab active" data-tab="general" aria-selected="true">General</button>
    <button class="client-options-tab" data-tab="fonts" aria-selected="false">Presentation</button>
    <button class="client-options-tab" data-tab="editor" aria-selected="false">Local Editor</button>
    <div class="client-options-panel" data-tab-panel="general"></div>
    <div class="client-options-panel hide" data-tab-panel="fonts"></div>
    <div class="client-options-panel hide" data-tab-panel="editor"></div>
  </div>
  </body></html>`;
  const { window, store } = setupClientOptionsDom(html);
  const options = await import("../../src/client/pages/client-options.js?tabs");
  Object.assign(options.store, store);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  const fontsTab = window.document.querySelector("[data-tab=\"fonts\"]");
  fontsTab.click();

  assert.equal(fontsTab.getAttribute("aria-selected"), "true");
  assert.ok(!window.document.querySelector("[data-tab-panel=\"fonts\"]").classList.contains("hide"));
  assert.ok(window.document.querySelector("[data-tab-panel=\"general\"]").classList.contains("hide"));
});
