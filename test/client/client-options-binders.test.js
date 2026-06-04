import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createClientOptionControlBinder } from "../../src/client/features/options/page/controls.js";
import { setupClientOptionsTabs } from "../../src/client/features/options/page/tabs.js";

test("client options tab binder activates one panel", () => {
  const dom = new JSDOM(`<!doctype html><html><body>
    <button class="client-options-tab active" data-tab="general"></button>
    <button class="client-options-tab" data-tab="fonts"></button>
    <section class="client-options-panel" data-tab-panel="general"></section>
    <section class="client-options-panel hide" data-tab-panel="fonts"></section>
  </body></html>`);
  const { document } = dom.window;

  setupClientOptionsTabs({ root: document });
  document.querySelector("[data-tab=\"fonts\"]").click();

  assert.equal(document.querySelector("[data-tab=\"fonts\"]").getAttribute("aria-selected"), "true");
  assert.equal(document.querySelector("[data-tab-panel=\"fonts\"]").classList.contains("hide"), false);
  assert.equal(document.querySelector("[data-tab-panel=\"general\"]").classList.contains("hide"), true);
});

test("client options control binder applies button, select, and input values", () => {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="client-options-page">
      <div class="option-row" id="commands-option">
        <button class="enabled-state btn-primary" data-val="true"></button>
        <button class="disabled-state" data-val="false"></button>
      </div>
      <div class="option-row" id="scroll-option">
        <select><option value="dbl"></option><option value="none"></option></select>
      </div>
      <div class="option-row" id="buffer-option">
        <input type="number" value="20" />
      </div>
    </div>
  </body></html>`);
  const { document, Event } = dom.window;
  const applied = [];
  const options = {
    options: {
      commands: { state: true, ok: [true, false] },
      scroll: { state: "dbl", ok: ["dbl", "none"] },
      buffer: { state: 10, ok: [0, 100] }
    },
    get(name) {
      return this.options[name];
    },
    save(name, value) {
      applied.push(["save", name, value]);
      this.options[name].state = value;
    }
  };
  let scrolls = 0;
  const binder = createClientOptionControlBinder({
    options,
    getActions: () => ({
      parseClientOptionCommand() {},
      refreshAutoscroll() {},
      scrollBuffer: () => {
        scrolls++;
      },
      setClientOption: (name, value) => {
        applied.push(["preference", name, value]);
      },
      setPreference() {}
    }),
    logger: { debug() {} }
  });

  binder.bindOptionButtons({ root: document });
  binder.bindOptionSelects({ root: document });
  binder.bindOptionInputs({ root: document });
  document.querySelector("#commands-option .disabled-state").click();
  const select = document.querySelector("#scroll-option select");
  select.value = "none";
  select.dispatchEvent(new Event("change"));
  const input = document.querySelector("#buffer-option input");
  input.value = "20";
  input.dispatchEvent(new Event("change"));

  assert.deepEqual(applied, [
    ["preference", "commandSuggestions", false],
    ["preference", "autoScroll", "none"],
    ["preference", "performanceBuffer", 20]
  ]);
  assert.equal(scrolls, 3);
});

test("client options button binder keeps selected yes/no state when active button is clicked", () => {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="client-options-page">
      <div class="option-row" id="commands-option">
        <button class="enabled-state btn-primary" data-val="true"></button>
        <button class="disabled-state" data-val="false"></button>
      </div>
      <div class="option-row" id="scrolluppause-option">
        <button class="enabled-state" data-val="true"></button>
        <button class="disabled-state btn-primary" data-val="false"></button>
      </div>
    </div>
  </body></html>`);
  const { document } = dom.window;
  const applied = [];
  const options = {
    options: {
      commands: { state: true, ok: [true, false] },
      scrolluppause: { state: false, ok: [true, false] }
    },
    get(name) {
      return this.options[name];
    },
    save(name, value) {
      this.options[name].state = value;
    }
  };
  const binder = createClientOptionControlBinder({
    options,
    getActions: () => ({
      scrollBuffer() {},
      setClientOption: (name, value) => {
        applied.push([name, value]);
      }
    }),
    logger: { debug() {} }
  });

  binder.bindOptionButtons({ root: document });
  document.querySelector("#commands-option .enabled-state").click();
  document.querySelector("#scrolluppause-option .disabled-state").click();

  assert.deepEqual(applied, [
    ["commandSuggestions", true],
    ["scrollUpToPause", false]
  ]);
  assert.equal(document.querySelector("#commands-option .enabled-state").classList.contains("btn-primary"), true);
  assert.equal(document.querySelector("#commands-option .disabled-state").classList.contains("btn-primary"), false);
  assert.equal(document.querySelector("#scrolluppause-option .enabled-state").classList.contains("btn-primary"), false);
  assert.equal(document.querySelector("#scrolluppause-option .disabled-state").classList.contains("btn-primary"), true);
});
