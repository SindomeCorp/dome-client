import { test } from "node:test";
import assert from "node:assert/strict";
/* global document */
import { setupDom } from "./index.js";
import { dome, socket, setSocket, logger } from "../../src/client/b-variables.js";

const loadInputReader = async (t, { ack = true, history = ["look"] } = {}) => {
  const { window } = setupDom("<!doctype html><html><body><input id=\"input\" /></body></html>");
  const origGlobals = { window: globalThis.window, document: globalThis.document };
  const { store } = await import("../../src/client/store.js");
  Object.assign(store, {
    history,
    get() {
      return this.history;
    },
    put(key, val) {
      this.history = val;
    }
  });
  const prevSocket = socket;
  setSocket({
    events: [],
    emit(event, cmd, cb) {
      this.events.push({ event, cmd });
      if (ack && cb) cb({ status: "command sent" });
    }
  });
  const origDome = {
    buffer: dome.buffer,
    preferences: dome.preferences,
    inputReader: dome.inputReader,
    onToggleAutoScroll: dome.onToggleAutoScroll,
    setFadeText: dome.setFadeText,
    statusDisplay: dome.statusDisplay
  };
  const output = [];
  dome.buffer = {
    appended: [],
    insertAdjacentHTML(pos, str) {
      this.appended.push(str);
    },
    append: (text) => output.push(text)
  };
  dome.preferences = { localEcho: true };
  dome.inputReader = document.querySelector("#input");
  dome.onToggleAutoScroll = () => {};
  dome.setFadeText = () => {};
  dome.statusDisplay = {};
  await import("../../src/client/d-inputreader.js");
  dome.setupInputReader();
  t.after(() => {
    setSocket(prevSocket);
    Object.assign(dome, origDome);
    globalThis.window = origGlobals.window;
    globalThis.document = origGlobals.document;
  });
  return { window, store };
};

test("up arrow recalls previous command", async (t) => {
  const { window } = await loadInputReader(t);
  const input = dome.inputReader;
  input.value = "";
  input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowUp" }));
  assert.equal(input.value, "look");
});

test("enter emits command and echoes", async (t) => {
  const { window, store } = await loadInputReader(t);
  const input = dome.inputReader;
  input.value = "say hi";
  input.dispatchEvent(new window.KeyboardEvent("keypress", { key: "Enter", shiftKey: false }));
  assert.equal(socket.events.length, 1);
  assert.deepEqual(socket.events[0], { event: "input", cmd: "say hi" });
  assert.equal(dome.buffer.appended[0], "<span class=\"input-echo\">&gt;say hi</span>\n");
  assert.equal(store.history.at(-1), "say hi");
  assert.equal(input.value, "");
});

test("enter with command suggestions disabled does not log error", async (t) => {
  const { window } = await loadInputReader(t);
  const origAuto = dome.autoComplete;
  dome.autoComplete = () => {};
  dome.preferences.commandSuggestions = false;
  const origError = logger.error;
  let logged = false;
  logger.error = () => {
    logged = true;
  };
  t.after(() => {
    dome.autoComplete = origAuto;
    logger.error = origError;
  });
  const input = dome.inputReader;
  input.value = "say hi";
  assert.doesNotThrow(() => {
    input.dispatchEvent(
      new window.KeyboardEvent("keypress", { key: "Enter", shiftKey: false })
    );
  });
  assert.equal(logged, false);
});

test("enter echoes even without server ack", async (t) => {
  const { window } = await loadInputReader(t, { ack: false });
  const input = dome.inputReader;
  input.value = "say hi";
  input.dispatchEvent(new window.KeyboardEvent("keypress", { key: "Enter", shiftKey: false }));
  assert.equal(dome.buffer.appended[0], "<span class=\"input-echo\">&gt;say hi</span>\n");
});

test("insert prompts and sends command", async (t) => {
  const { window } = await loadInputReader(t);
  const origPrompt = globalThis.prompt;
  window.prompt = globalThis.prompt = () => "look";
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Insert" }));
  window.prompt = globalThis.prompt = origPrompt;
  assert.equal(socket.events.length, 1);
  assert.deepEqual(socket.events[0], { event: "input", cmd: "look" });
  assert.equal(dome.buffer.appended[0], "<span class=\"input-echo\">&gt;look</span>\n");
});


test("command history capped at 2000 entries", async (t) => {
  const longHistory = Array.from({ length: 2000 }, (_, i) => `c${i}`);
  const { window, store } = await loadInputReader(t, { history: longHistory });
  const input = dome.inputReader;
  input.value = "extra";
  input.dispatchEvent(new window.KeyboardEvent("keypress", { key: "Enter", shiftKey: false }));
  assert.equal(store.history.length, 2000);
  assert.equal(store.history[0], "c1");
  assert.equal(store.history.at(-1), "extra");
});

test("down arrow stores current input and clears field", async (t) => {
  t.mock.timers.enable();
  const { window, store } = await loadInputReader(t);
  const input = dome.inputReader;
  input.value = "temp";
  input.dispatchEvent(new window.KeyboardEvent("keypress", { key: "t" }));
  t.mock.timers.tick(5);
  input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown" }));
  assert.equal(input.value, "");
  assert.equal(store.history.length, 2);
  assert.equal(store.history.at(-1), "temp");
  input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowUp" }));
  assert.equal(input.value, "temp");
});

test("pause key toggles autoscroll", async (t) => {
  const { window } = await loadInputReader(t);
  let toggled = 0;
  dome.onToggleAutoScroll = () => { toggled++; };
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Pause" }));
  assert.equal(toggled, 1);
});

test("down arrow restores last input", async (t) => {
  t.mock.timers.enable();
  const { window } = await loadInputReader(t);
  const input = dome.inputReader;
  input.value = "say";
  input.dispatchEvent(new window.KeyboardEvent("keypress", { key: "a" }));
  t.mock.timers.tick(5);
  input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowUp" }));
  assert.equal(input.value, "look");
  input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown" }));
  assert.equal(input.value, "say");
});

test("long line arrow navigation respects cursor position", async (t) => {
  const { window } = await loadInputReader(t);
  const input = dome.inputReader;
  const longLine = "a".repeat(160);
  input.value = longLine;
  input.selectionStart = 5;
  input.selectionEnd = 5;
  input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowUp" }));
  assert.equal(input.value, longLine);
});

test("enter on empty input sends empty command", async (t) => {
  const { window, store } = await loadInputReader(t);
  const input = dome.inputReader;
  input.value = "";
  input.dispatchEvent(new window.KeyboardEvent("keypress", { key: "Enter", shiftKey: false }));
  assert.equal(socket.events.length, 1);
  assert.deepEqual(socket.events[0], { event: "input", cmd: "" });
  assert.equal(dome.buffer.appended[0], "<span class=\"input-echo\">&gt;</span>\n");
  assert.deepEqual(store.history, ["look"]);
});

test("arrow up after send recalls last command", async (t) => {
  const { window } = await loadInputReader(t);
  const input = dome.inputReader;
  input.value = "say hi";
  input.dispatchEvent(new window.KeyboardEvent("keypress", { key: "Enter", shiftKey: false }));
  input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowUp" }));
  assert.equal(input.value, "say hi");
});
