import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  bindClearBufferControls,
  bindEscapeOverlayClose,
  clearClientBuffer,
  shouldConfirmClearBuffer
} from "../../src/client/button-workflows.js";

test("clearClientBuffer empties output and resets renderer state", (t) => {
  const dom = new JSDOM("<!doctype html><div>log</div>");
  const client = {
    buffer: dom.window.document.querySelector("div"),
    resetSdwcNowrapState: () => {},
    resetAnsiRendererState: () => {}
  };
  const resetSdwc = t.mock.method(client, "resetSdwcNowrapState");
  const resetAnsi = t.mock.method(client, "resetAnsiRendererState");

  clearClientBuffer(client);

  assert.equal(client.buffer.innerHTML, "");
  assert.equal(resetSdwc.mock.callCount(), 1);
  assert.equal(resetAnsi.mock.callCount(), 1);
});

test("bindClearBufferControls opens mobile confirmation before clearing", () => {
  const dom = new JSDOM(`<!doctype html>
    <button id="clear"></button>
    <div id="overlay" class="hide"></div>
    <button id="confirm"></button>
    <button id="cancel"></button>
    <div id="buffer">log</div>`);
  const { document } = dom.window;
  const client = { buffer: document.querySelector("#buffer") };
  const overlay = document.querySelector("#overlay");
  const windowRef = { matchMedia: () => ({ matches: true }) };

  bindClearBufferControls({
    client,
    button: document.querySelector("#clear"),
    overlay,
    confirmButton: document.querySelector("#confirm"),
    cancelButton: document.querySelector("#cancel"),
    windowRef
  });

  document.querySelector("#clear").click();
  assert.equal(client.buffer.innerHTML, "log");
  assert.equal(overlay.classList.contains("hide"), false);

  document.querySelector("#cancel").click();
  assert.equal(overlay.classList.contains("hide"), true);

  document.querySelector("#clear").click();
  document.querySelector("#confirm").click();
  assert.equal(client.buffer.innerHTML, "");
  assert.equal(overlay.classList.contains("hide"), true);
});

test("shouldConfirmClearBuffer checks the small-screen media query", () => {
  assert.equal(shouldConfirmClearBuffer({ matchMedia: () => ({ matches: true }) }), true);
  assert.equal(shouldConfirmClearBuffer({ matchMedia: () => ({ matches: false }) }), false);
  assert.equal(shouldConfirmClearBuffer({}), false);
});

test("bindEscapeOverlayClose hides visible overlays only on escape", () => {
  const dom = new JSDOM("<!doctype html><div id=\"one\"></div><div id=\"two\" class=\"hide\"></div>");
  const { document, KeyboardEvent } = dom.window;
  const one = document.querySelector("#one");
  const two = document.querySelector("#two");

  bindEscapeOverlayClose({ documentRef: document, overlays: [one, two] });

  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  assert.equal(one.classList.contains("hide"), false);

  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  assert.equal(one.classList.contains("hide"), true);
  assert.equal(two.classList.contains("hide"), true);
});
