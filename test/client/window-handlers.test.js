import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { dome, setSocket, SOCKET_STATE_ENUM, defaultHeightOffset } from "../../src/client/b-variables.js";

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

  await import("../../src/client/e-window.js");
  dome.setupWindowHandlers();

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

  await import("../../src/client/e-window.js?focus");
  dome.setupWindowHandlers();

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

  await import("../../src/client/e-window.js?scroll");
  dome.setupWindowHandlers();

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

  await import("../../src/client/e-window.js?events");
  dome.setupWindowHandlers();

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
  setSocket(mockSocket);
  dome.socketState = SOCKET_STATE_ENUM.CONNECTED;

  window.dispatchEvent(new window.Event("unload"));

  assert.equal(emitMock.mock.calls.length, 1);
  assert.deepEqual(emitMock.mock.calls[0].arguments, ["input", "@quit\r\n"]);

  t.mock.restoreAll();
  setSocket(null);
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

  await import("../../src/client/e-window.js?playding");
  await import("../../src/client/c-preferences.js?playding");
  dome.setupWindowHandlers();

  assert.equal(dome.alert.active, false);
  dome.setClientOption("playDing", true);
  assert.equal(dome.alert.active, true);
  dome.setClientOption("playDing", false);
  assert.equal(dome.alert.active, false);

});

