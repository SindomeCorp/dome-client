import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { dome, logger } from "../../src/client/b-variables.js";

const setup = async (commands = []) => {
  const dom = new JSDOM("<!doctype html><html><body><input id=\"input\" /></body></html>", {
    url: "https://example.com/",
    pretendToBeVisual: true
  });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  dome.preferences = { broadSearch: false };
  await import("../../src/client/w-autocomplete.js");
  dome.autoComplete();
  globalThis.fetch = () =>
    Promise.resolve({
      json: () => Promise.resolve(commands)
    });
  const input = window.document.querySelector("#input");
  await dome.setupAutoComplete(input, "user");
  return { window, input };
};

test("setupAutoComplete loads commands and attaches widget", async () => {
  const { input } = await setup(["say | say something"]);

  assert.equal(dome.setupAutoComplete.constructor.name, "AsyncFunction");

  assert.equal(dome.autoCommands.length, 1);
  assert.equal(dome.autoCommands[0].value, "say");
  assert.equal(typeof input.commandSuggestions, "function");
  assert.equal(input.commandSuggestionsOptions.minLength, 2);
});

test("setupAutoComplete warns when fetch fails", async () => {
  const dom = new JSDOM("<!doctype html><html><body><input id=\"input\" /></body></html>", {
    url: "https://example.com/",
    pretendToBeVisual: true
  });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  dome.preferences = { broadSearch: false };
  await import("../../src/client/w-autocomplete.js");
  dome.autoComplete();

  globalThis.fetch = () => Promise.reject(new Error("boom"));
  let warned = false;
  logger.warn = () => {
    warned = true;
  };

  const input = window.document.querySelector("#input");
  await dome.setupAutoComplete(input, "user");

  assert.equal(warned, true);
});

test("source filters suggestions and handles edge cases", async () => {
  const { input } = await setup([
    "say | say something",
    "save | save game",
    "list | list items"
  ]);
  const source = input.commandSuggestionsOptions.source;
  let matches = [];

  source({ term: "" }, (m) => {
    matches = m;
  });
  assert.equal(matches.length, 3);

  source({ term: "sa" }, (m) => {
    matches = m;
  });
  assert.deepEqual(
    matches.map((m) => m.value),
    ["say", "save"]
  );

  source({ term: "sav" }, (m) => {
    matches = m;
  });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].value, "save");

  source({ term: "zz" }, (m) => {
    matches = m;
  });
  assert.equal(matches.length, 0);
});

test("typing displays matching suggestions", async () => {
  const { window, input } = await setup(["say | say something"]);
  input.getBoundingClientRect = () => ({
    left: 5,
    top: 100,
    bottom: 110,
    width: 150,
    height: 10,
    right: 155
  });
  input.value = "sa";
  input.dispatchEvent(new window.Event("input"));
  const list = window.document.querySelector(".command-suggestions");
  assert.ok(list);
  assert.equal(list.children.length, 1);
  assert.ok(list.innerHTML.includes("say"));
  assert.equal(list.style.display, "block");
  assert.equal(list.style.zIndex, "1000");
  assert.equal(list.style.top, "100px");
});

test("keyboard navigation and selection of suggestions", async () => {
  const { window, input } = await setup([
    "say | say something",
    "save | save game"
  ]);

  let suggestions = [];
  input.commandSuggestionsOptions.source({ term: "sa" }, (m) => {
    suggestions = m;
  });

  let index = -1;
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" && index < suggestions.length - 1) {
      index++;
    } else if (event.key === "ArrowUp" && index > 0) {
      index--;
    } else if (event.key === "Enter" && index >= 0) {
      input.value = suggestions[index].value;
    }
  });

  input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown" }));
  assert.equal(index, 0);
  input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown" }));
  assert.equal(index, 1);
  input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowUp" }));
  assert.equal(index, 0);

  input.value = "";
  input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
  assert.equal(input.value, "say");
});

test("setupAutoComplete respects existing commandSuggestions function", async () => {
  const dom = new JSDOM("<!doctype html><html><body><input id=\"input\" /></body></html>", {
    url: "https://example.com/",
    pretendToBeVisual: true
  });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  dome.preferences = { broadSearch: false };
  await import("../../src/client/w-autocomplete.js");
  dome.autoComplete();
  const input = window.document.querySelector("#input");
  let called = false;
  const original = function() {
    called = true;
  };
  input.commandSuggestions = original;
  globalThis.fetch = () =>
    Promise.resolve({ json: () => Promise.resolve(["say | say something"]) });
  await dome.setupAutoComplete(input, "user");
  assert.equal(called, true);
  assert.equal(input.commandSuggestions, original);
});
