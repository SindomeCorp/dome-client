import { test } from "node:test";
import assert from "node:assert/strict";
/* global document */
import { setupDom } from "./index.js";
import { wireHistorySearchOverlay } from "../../src/client/history-search-overlay.js";

const setupHistorySearch = (history = ["look"]) => {
  const { window } = setupDom("<!doctype html><html><body><textarea id=\"input\"></textarea><div id=\"history-search-overlay\" class=\"hide\"><div class=\"history-search-content\"><button id=\"button-history-search-close\" type=\"button\">x</button><input id=\"history-search-query\" /><ul id=\"history-search-results\"></ul><div id=\"history-search-empty\" class=\"hide\">No matching commands.</div></div></div></body></html>");
  const inputReader = document.querySelector("#input");
  const selected = [];

  wireHistorySearchOverlay({
    document,
    inputReader,
    historySource: () => history.slice().reverse(),
    onSelect(command) {
      selected.push(command);
      inputReader.value = command;
    }
  });

  return {
    inputReader,
    selected,
    window,
    overlay: document.querySelector("#history-search-overlay"),
    query: document.querySelector("#history-search-query"),
    results: document.querySelector("#history-search-results")
  };
};

test("ctrl+r opens history search overlay and focuses query", () => {
  const { window, overlay, query } = setupHistorySearch();

  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "r", ctrlKey: true, bubbles: true, cancelable: true }));

  assert.ok(!overlay.classList.contains("hide"));
  assert.equal(document.activeElement, query);
});

test("ctrl+r while overlay is open does not prevent default", () => {
  const { window } = setupHistorySearch();
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "r", ctrlKey: true, bubbles: true, cancelable: true }));

  const event = new window.KeyboardEvent("keydown", { key: "r", ctrlKey: true, bubbles: true, cancelable: true });
  document.dispatchEvent(event);

  assert.equal(event.defaultPrevented, false);
});

test("history search filters by contains and selects with enter", () => {
  const { inputReader, overlay, query, results, selected, window } = setupHistorySearch(["look", "say hi", "pose hi there"]);

  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "r", ctrlKey: true, bubbles: true, cancelable: true }));
  query.value = "hi";
  query.dispatchEvent(new window.Event("input", { bubbles: true }));

  assert.equal(results.children.length, 2);
  assert.equal(results.children[0].textContent, "pose hi there");
  assert.equal(results.children[1].textContent, "say hi");

  query.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
  query.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));

  assert.ok(overlay.classList.contains("hide"));
  assert.deepEqual(selected, ["say hi"]);
  assert.equal(inputReader.value, "say hi");
  assert.equal(inputReader.selectionStart, inputReader.value.length);
  assert.equal(inputReader.selectionEnd, inputReader.value.length);
});

test("history search closes on escape without selecting", () => {
  const { inputReader, overlay, query, selected, window } = setupHistorySearch();
  inputReader.value = "keep me";

  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "r", ctrlKey: true, bubbles: true, cancelable: true }));
  query.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));

  assert.ok(overlay.classList.contains("hide"));
  assert.deepEqual(selected, []);
  assert.equal(inputReader.value, "keep me");
});

test("history search close button and backdrop close overlay", () => {
  const { overlay, window } = setupHistorySearch();

  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "r", ctrlKey: true, bubbles: true, cancelable: true }));
  document.querySelector("#button-history-search-close").click();
  assert.ok(overlay.classList.contains("hide"));

  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "r", ctrlKey: true, bubbles: true, cancelable: true }));
  overlay.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.ok(overlay.classList.contains("hide"));
});

test("history search de-duplicates exact command matches", () => {
  const { query, results, window } = setupHistorySearch(["look", "@edit $su:nn", "@edit $su:nn", "@edit $su:nn", "say hi"]);

  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "r", ctrlKey: true, bubbles: true, cancelable: true }));
  query.value = "@edit";
  query.dispatchEvent(new window.Event("input", { bubbles: true }));

  assert.equal(results.children.length, 1);
  assert.equal(results.children[0].textContent, "@edit $su:nn");
});

test("history search keyboard navigation scrolls active item into view", (t) => {
  const { query, window } = setupHistorySearch(["one", "two", "three"]);
  let calls = 0;
  const original = window.HTMLElement.prototype.scrollIntoView;
  window.HTMLElement.prototype.scrollIntoView = () => {
    calls++;
  };
  t.after(() => {
    window.HTMLElement.prototype.scrollIntoView = original;
  });

  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "r", ctrlKey: true, bubbles: true, cancelable: true }));
  query.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));

  assert.ok(calls >= 2);
});
