import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { SOCKET_STATE_ENUM, defaultHeightOffset } from "../../src/client/core/constants.js";
import { createClientState } from "../../src/client/core/client-state.js";
import { setupClientPreferences } from "../../src/client/core/preferences.js";
import { setupWindowHandlers } from "../../src/client/features/terminal/window-handlers.js";

const dome = createClientState();

test.afterEach(() => {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.Audio;
  delete globalThis.localStorage;
});

test("window handlers parse IDs, set titles, and flash alerts", async () => {
  const dom = new JSDOM(`<!doctype html><html><head><title></title></head><body>
    <div id="client"></div>
    <div id="buffer"></div>
  </body></html>`, { pretendToBeVisual: true });

  const { window } = dom;
  const { document } = window;
  globalThis.window = window;
  globalThis.document = document;
  globalThis.Audio = class {};

  Object.assign(dome, {
    client: document.querySelector("#client"),
    buffer: document.querySelector("#buffer"),
    preferences: { playDing: true }
  });

  setupWindowHandlers({ client: dome, win: window, doc: document });

  assert.equal(
    dome.parseYouTubeID("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    "dQw4w9WgXcQ"
  );

  dome.setWindowTitle("My Title");
  assert.equal(window.document.title, "My Title");
  assert.equal(dome.titleBarText, "My Title");

  const originalInterval = window.setInterval;
  let intervalCallback;
  window.setInterval = cb => {
    intervalCallback = cb;
    return 1;
  };

  dome.windowAlert();
  const firstProc = dome.alert.titleProc;
  dome.windowAlert();
  assert.equal(dome.alert.titleProc, firstProc);

  intervalCallback();
  assert.equal(window.document.title, "!! My Title");
  intervalCallback();
  assert.equal(window.document.title, "My Title");
  window.clearInterval(dome.alert.titleProc);
  window.setInterval = originalInterval;
});

test("onFocusHandler clears alerts and focuses input", async () => {
  const dom = new JSDOM(`<!doctype html><html><head><title></title></head><body>
    <div id="client"></div>
    <div id="buffer"></div>
  </body></html>`, { pretendToBeVisual: true });

  const { window } = dom;
  const { document } = window;
  globalThis.window = window;
  globalThis.document = document;
  globalThis.Audio = class {};

  Object.assign(dome, {
    client: document.querySelector("#client"),
    buffer: document.querySelector("#buffer"),
    preferences: { playDing: true }
  });

  setupWindowHandlers({ client: dome, win: window, doc: document });

  dome.setWindowTitle("Title");
  window.document.title = "!! Title";

  const intervalId = window.setInterval(() => {}, 1000);
  let clearedId = null;
  const originalClear = window.clearInterval;
  window.clearInterval = id => { clearedId = id; originalClear(id); };
  dome.alert.titleProc = intervalId;

  let focused = false;
  dome.inputReader = { focus: () => { focused = true; } };

  window.dispatchEvent(new window.Event("focus"));

  assert.equal(clearedId, intervalId);
  assert.equal(dome.alert.titleProc, null);
  assert.equal(window.document.title, "Title");
  assert.ok(focused);

  window.clearInterval = originalClear;
});

test("onScrollHandler hides offscreen images", async () => {
  const dom = new JSDOM(`<!doctype html><html><head><title></title></head><body>
    <div id="client"></div>
    <div id="buffer">
      <img id="img1" class="shown-image" />
      <SPAN id="simg1">text</SPAN>
    </div>
    <i id="bimg1" class="icon-chevron-down"></i>
  </body></html>`, { pretendToBeVisual: true });

  const { window } = dom;
  const { document } = window;
  globalThis.window = window;
  globalThis.document = document;
  globalThis.Audio = class {};

  Object.assign(dome, {
    client: document.querySelector("#client"),
    buffer: document.querySelector("#buffer"),
    preferences: { playDing: true }
  });

  setupWindowHandlers({ client: dome, win: window, doc: document });

  window.pageXOffset = 0;
  window.pageYOffset = 0;
  window.innerWidth = 800;
  window.innerHeight = 600;

  const img = document.getElementById("img1");
  img.getBoundingClientRect = () => ({
    top: 1000,
    left: 0,
    bottom: 1010,
    right: 10,
    width: 10,
    height: 10
  });

  dome.buffer.dispatchEvent(new window.Event("scroll"));

  const control = document.querySelector("#bimg1");
  assert.ok(control.classList.contains("icon-chevron-up"));
  assert.ok(!control.classList.contains("icon-chevron-down"));
  assert.equal(dome.buffer.querySelector("#simg1").innerHTML, "");
});

test("window handlers respond to focus, blur, resize, and unload", async (t) => {
  const dom = new JSDOM(`<!doctype html><html><head><title></title></head><body>
    <div id="client"></div>
    <div id="buffer"></div>
  </body></html>`, { pretendToBeVisual: true });

  const { window } = dom;
  const { document } = window;
  globalThis.window = window;
  globalThis.document = document;
  globalThis.Audio = class {};

  Object.assign(dome, {
    client: document.querySelector("#client"),
    buffer: document.querySelector("#buffer"),
    preferences: { playDing: true }
  });

  window.innerHeight = 900;

  setupWindowHandlers({ client: dome, win: window, doc: document });

  dome.alert.titleProc = 1;
  dome.titleBarText = "Title";
  document.title = "!! Title";
  dome.alert.active = true;
  dome.inputReader = { focus() {} };
  const focusMock = t.mock.method(dome.inputReader, "focus");
  const clearMock = t.mock.method(window, "clearInterval");

  window.dispatchEvent(new window.Event("focus"));

  assert.equal(clearMock.mock.calls[0].arguments[0], 1);
  assert.equal(dome.alert.titleProc, null);
  assert.equal(document.title, "Title");
  assert.equal(dome.alert.active, false);
  assert.equal(focusMock.mock.calls.length, 1);

  window.dispatchEvent(new window.Event("blur"));
  assert.equal(dome.alert.active, true);

  window.innerHeight = 700;
  window.dispatchEvent(new window.Event("resize"));
  assert.equal(dome.client.style.height, "700px");
  assert.equal(dome.buffer.style.height, `${700 - defaultHeightOffset}px`);

  const mockSocket = { emit() {} };
  const emitMock = t.mock.method(mockSocket, "emit");
  dome.socket = mockSocket;
  dome.socketState = SOCKET_STATE_ENUM.CONNECTED;

  window.dispatchEvent(new window.Event("unload"));

  assert.equal(emitMock.mock.calls.length, 1);
  assert.deepEqual(emitMock.mock.calls[0].arguments, ["input", "@quit\r\n"]);

  t.mock.restoreAll();
  dome.socket = null;
});

test("toggling playDing while unfocused updates alert", async () => {
  const dom = new JSDOM(`<!doctype html><html><head><title></title></head><body>
    <div id="client"></div>
    <div id="buffer"></div>
  </body></html>`, { pretendToBeVisual: true, url: "https://example.com" });

  const { window } = dom;
  const { document } = window;
  globalThis.window = window;
  globalThis.document = document;
  globalThis.Audio = class {};
  globalThis.localStorage = window.localStorage;

  document.hasFocus = () => false;

  Object.assign(dome, {
    client: document.querySelector("#client"),
    buffer: document.querySelector("#buffer"),
    preferences: { playDing: false }
  });

  setupClientPreferences({ client: dome, doc: document, win: window });
  setupWindowHandlers({ client: dome, win: window, doc: document });

  assert.equal(dome.alert.active, false);
  dome.setClientOption("playDing", true);
  assert.equal(dome.alert.active, true);
  dome.setClientOption("playDing", false);
  assert.equal(dome.alert.active, false);

});

test("returning to focused output or a context menu clears alerts and keeps keyboard focus", (t) => {
  const { window } = new JSDOM(`<!doctype html><div id="client">
    <div class="output-scroll" id="buffer"><button id="row">Output</button></div>
    <div class="context-menu-popup"><button id="menuitem">Copy</button></div>
    <input id="command">
  </div>`);
  const { document } = window;
  t.after(() => window.close());
  const client = createClientState();
  Object.assign(client, {
    client: document.querySelector("#client"),
    buffer: document.querySelector("#buffer"),
    inputReader: document.querySelector("#command"),
    preferences: { playDing: true }
  });
  const interval = t.mock.method(window, "setInterval", () => 23);
  const clear = t.mock.method(window, "clearInterval", () => {});
  setupWindowHandlers({ client, win: window, doc: document, AudioCtor: class {} });
  client.setWindowTitle("Local fixture");

  for (const selector of ["#row", "#menuitem"]) {
    const focused = document.querySelector(selector);
    focused.focus();
    window.dispatchEvent(new window.Event("blur"));
    client.windowAlert();
    const [flash] = interval.mock.calls.at(-1).arguments;
    flash();
    assert.equal(document.title, "!! Local fixture");

    window.dispatchEvent(new window.Event("focus"));
    assert.equal(document.activeElement, focused);
    assert.equal(client.alert.active, false);
    assert.equal(client.alert.titleProc, null);
    assert.equal(document.title, "Local fixture");
  }

  assert.deepEqual(clear.mock.calls.map(call => call.arguments), [[23], [23]]);
});

test("window close confirms and sends quit only while the game is connected", (t) => {
  const { window } = new JSDOM(`<!doctype html>
    <div id="client"><div id="buffer"></div></div>`,
  );
  const { document } = window;
  t.after(() => window.close());
  const client = createClientState();
  const emit = t.mock.fn();
  Object.assign(client, {
    client: document.querySelector("#client"),
    buffer: document.querySelector("#buffer"),
    socket: { emit }
  });
  setupWindowHandlers({ client, win: window, doc: document, AudioCtor: class {} });

  for (const state of [SOCKET_STATE_ENUM.BEFORE_FIRST, SOCKET_STATE_ENUM.DISCONNECTED, SOCKET_STATE_ENUM.RECONNECT_FAILED, SOCKET_STATE_ENUM.CONNECTED]) {
    client.socketState = state;
    const before = new window.Event("beforeunload", { cancelable: true });
    window.dispatchEvent(before);
    assert.equal(before.defaultPrevented, state === SOCKET_STATE_ENUM.CONNECTED);
    window.dispatchEvent(new window.Event("unload"));
  }

  assert.deepEqual(emit.mock.calls.map(call => call.arguments), [["input", "@quit\r\n"]]);
});
