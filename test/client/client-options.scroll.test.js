import { test } from "node:test";
import assert from "node:assert/strict";
import { setupClientOptionsDom } from "./index.js";
import { dome } from "../../src/client/b-variables.js";

// Changing a client option via the overlay should scroll the buffer.
test("client-options change scrolls buffer", async () => {
  const html = `<!doctype html><html><body>
  <div class="client-options-page">
    <div class="option-row" id="commands-option">
      <button class="enabled-state btn-primary" data-val="true">on</button>
      <button class="disabled-state" data-val="false">off</button>
    </div>
  </div>
  </body></html>`;
  const { window, store } = setupClientOptionsDom(html);
  const output = [];
  let scrolled = false;
  Object.assign(dome, {
    buffer: { append: (text) => output.push(text) },
    preferences: { commandSuggestions: true },
    scrollBuffer: () => { scrolled = true; },
    setClientOption: (name, val) => {
      dome.buffer.append(`changing @client-option ${name} to ${val}\n`);
      dome.preferences[name] = val;
    }
  });
  const options = await import("../../src/client/pages/client-options.js");
  Object.assign(options.store, store);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  const offBtn = window.document.querySelector("#commands-option .disabled-state");
  offBtn.click();
  assert.ok(output.some((line) => line.includes("changing @client-option commandSuggestions to false")));
  assert.equal(scrolled, true);
});
