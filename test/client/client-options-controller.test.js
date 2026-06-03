import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createClientOptionsController } from "../../src/client/features/options/client-options-controller.js";
import { createClientOptionsStore } from "../../src/client/features/options/client-options-store.js";

function createMapStorage() {
  const data = new Map();
  return {
    data,
    get(key) {
      return data.has(key) ? data.get(key) : null;
    },
    put(key, value) {
      data.set(key, value);
    }
  };
}

test("client options controller writes by key, param, and preference name through one boundary", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://example.com/" });
  const storage = createMapStorage();
  const options = createClientOptionsStore({ storage });
  const client = { buffer: { append() {} }, preferences: {} };
  const controller = createClientOptionsController({
    client,
    doc: dom.window.document,
    win: dom.window,
    storage,
    options
  });
  client.preferences = controller.readPreferences();

  const byKey = controller.setOption("localecho", true, { source: "ui" });
  const byParam = controller.setOption("le", false, { source: "command" });
  const byPreference = controller.setOption("localEcho", true, { source: "import" });

  assert.equal(byKey.status, "changed");
  assert.equal(byKey.preferenceName, "localEcho");
  assert.equal(byParam.status, "changed");
  assert.equal(byPreference.status, "changed");
  assert.equal(client.preferences.localEcho, true);
  assert.equal(storage.get("dc-toggle-localecho"), true);
});

test("client options controller rejects invalid values without mutating preferences or storage", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://example.com/" });
  const storage = createMapStorage();
  const options = createClientOptionsStore({ storage });
  const client = { buffer: { append() {} }, preferences: {} };
  const controller = createClientOptionsController({
    client,
    doc: dom.window.document,
    win: dom.window,
    storage,
    options
  });
  client.preferences = controller.readPreferences();

  const result = controller.setOption("lineBufferFontSizePt", 100, { source: "command" });

  assert.equal(result.ok, false);
  assert.equal(result.status, "invalid-value");
  assert.equal(client.preferences.lineBufferFontSizePt, 9.75);
  assert.equal(storage.get("dc-toggle-outfontsize"), null);
});

test("client options controller handles help, read, unknown, unchanged, and disabled feature branches", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://example.com/" });
  dom.window.shortenEnabled = false;
  const storage = createMapStorage();
  const options = createClientOptionsStore({ storage });
  const client = { buffer: { append() {} }, preferences: {} };
  const controller = createClientOptionsController({
    client,
    doc: dom.window.document,
    win: dom.window,
    storage,
    options
  });
  client.preferences = controller.readPreferences();

  const help = controller.parseCommand("@client-option");
  const list = controller.parseCommand("@client-options");
  const read = controller.parseCommand("@client-options localEcho");
  const invalidRead = controller.parseCommand("@client-options nope");
  const unknown = controller.setOption("nope", true);
  const unchanged = controller.setOption("localEcho", client.preferences.localEcho);
  const disabled = controller.setOption("shortenUrls", true, { source: "ui" });

  assert.equal(help.ok, true);
  assert.match(help.output.join(""), /@client-options/);
  assert.equal(list.ok, true);
  assert.match(list.output, /localEcho/);
  assert.equal(read.ok, true);
  assert.match(read.output, /localEcho/);
  assert.equal(invalidRead.ok, false);
  assert.equal(unknown.status, "invalid-option");
  assert.equal(unchanged.status, "unchanged");
  assert.equal(disabled.status, "disabled-feature");
  assert.equal(client.preferences.shortenUrls, false);
  assert.equal(storage.get("dc-toggle-shorten"), false);
});

test("client options controller applies side effects for changed options", async (t) => {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="buffer" class="standardText colorset-normal"></div>
    <input id="inputBuffer" class="colorset-normal">
  </body></html>`, { url: "https://example.com/" });
  const storage = createMapStorage();
  const options = createClientOptionsStore({ storage });
  const setupAutoscrollFn = t.mock.fn();
  const setupAutoCompleteFeatureFn = t.mock.fn();
  const inputReader = dom.window.document.getElementById("inputBuffer");
  inputReader.commandSuggestions = t.mock.fn(() => Promise.resolve());
  const client = {
    alert: {},
    buffer: dom.window.document.getElementById("buffer"),
    inputReader,
    ideWindow: { postMessage: t.mock.fn() },
    preferences: {},
    setupAutoComplete: t.mock.fn(() => Promise.resolve()),
    socket: { emit: t.mock.fn() },
    spawned: {
      editor: { postMessage: t.mock.fn() }
    },
    userType: "player"
  };
  dom.window.document.hasFocus = () => false;
  const controller = createClientOptionsController({
    client,
    doc: dom.window.document,
    win: dom.window,
    storage,
    options,
    setupAutoscrollFn,
    setupAutoCompleteFeatureFn
  });
  client.preferences = controller.readPreferences();

  controller.setOption("lineBufferFont", "courier");
  controller.setOption("colorSet", "dim");
  controller.setOption("editorFont", "lucida");
  controller.setOption("commandSuggestions", false);
  controller.setOption("commandSuggestions", true);
  await Promise.resolve();
  controller.setOption("broadSearch", true);
  controller.setOption("autoScroll", "none");
  controller.setOption("shortenUrls", false);
  controller.setOption("shortenUrls", true);
  controller.setOption("playDing", false);
  controller.setOption("playDing", true);

  assert.ok(client.buffer.classList.contains("courierText"));
  assert.ok(client.buffer.classList.contains("colorset-dim"));
  assert.ok(inputReader.classList.contains("colorset-dim"));
  assert.deepEqual(client.spawned.editor.postMessage.mock.calls[0].arguments[0], { type: "set-editor-font", font: "lucida" });
  assert.deepEqual(client.ideWindow.postMessage.mock.calls[0].arguments[0], { type: "ide-set-font", font: "lucida" });
  assert.equal(setupAutoCompleteFeatureFn.mock.callCount(), 1);
  assert.ok(inputReader.commandSuggestions.mock.calls.some((call) => call.arguments[0] === "destroy"));
  assert.equal(setupAutoscrollFn.mock.callCount(), 1);
  assert.deepEqual(client.socket.emit.mock.calls[0].arguments, ["shorten-on", "shorten-on"]);
  assert.equal(client.alert.active, true);
});
