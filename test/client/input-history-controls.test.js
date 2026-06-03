import { test } from "node:test";
import assert from "node:assert/strict";
/* global document */
import { setupDom } from "./index.js";
import { createHistoryState, rememberDraftInput } from "../../src/client/features/terminal/input-history.js";
import { wireInputHistoryControls } from "../../src/client/features/terminal/input-history-controls.js";

const setupHistoryControls = (history = ["look"]) => {
  const { window } = setupDom("<!doctype html><html><body><textarea id=\"input\"></textarea><button id=\"button-input-history-up\" type=\"button\"></button><button id=\"button-input-history-down\" type=\"button\"></button></body></html>");
  const inputReader = document.querySelector("#input");
  const historyState = createHistoryState(history);
  const store = {
    saved: null,
    put(key, value) {
      this.saved = { key, value };
    }
  };

  wireInputHistoryControls({
    document,
    inputReader,
    historyState,
    store
  });

  return {
    historyState,
    inputReader,
    store,
    window
  };
};

test("up arrow recalls previous command", () => {
  const { inputReader, window } = setupHistoryControls();

  inputReader.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowUp" }));

  assert.equal(inputReader.value, "look");
});

test("long input arrow navigation respects cursor position", () => {
  const { inputReader, window } = setupHistoryControls();
  const longLine = "a".repeat(160);
  inputReader.value = longLine;
  inputReader.selectionStart = 5;
  inputReader.selectionEnd = 5;

  inputReader.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowUp" }));

  assert.equal(inputReader.value, longLine);
});

test("down arrow stores current draft input and clears field", () => {
  const { historyState, inputReader, store, window } = setupHistoryControls();
  inputReader.value = "temp";
  rememberDraftInput(historyState, "temp");

  inputReader.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown" }));

  assert.equal(inputReader.value, "");
  assert.deepEqual(store.saved, {
    key: "my-input-buffer",
    value: ["look", "temp"]
  });
});

test("mobile buttons force navigation regardless of cursor position", () => {
  const { inputReader } = setupHistoryControls();
  const multiline = `${"a".repeat(70)}\n${"b".repeat(70)}\n${"c".repeat(70)}`;
  inputReader.value = multiline;
  const pos = inputReader.value.lastIndexOf("\n") + 3;
  inputReader.selectionStart = pos;
  inputReader.selectionEnd = pos;

  document.querySelector("#button-input-history-up").click();

  assert.equal(inputReader.value, "look");
});

test("missing mobile history buttons are ignored", () => {
  const { window } = setupDom("<!doctype html><html><body><textarea id=\"input\"></textarea></body></html>");
  const inputReader = document.querySelector("#input");
  const historyState = createHistoryState(["look"]);
  const store = {
    put() {}
  };

  assert.doesNotThrow(() => {
    wireInputHistoryControls({
      document,
      inputReader,
      historyState,
      store
    });
  });
  inputReader.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowUp" }));
  assert.equal(inputReader.value, "look");
});
