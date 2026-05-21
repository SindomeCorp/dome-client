/* global document */

import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { JSDOM } from "jsdom";
import { dome as baseDome } from "../../src/client/b-variables.js";
import { buildLogHtml } from "../../src/shared/log-template.js";

const setupWindow = async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { runScripts: "outside-only" });
  const { window } = dom;
  const buffer = window.document.createElement("div");
  buffer.id = "buffer";
  window.document.body.appendChild(buffer);
  const dome = Object.assign(baseDome, {
    preferences: { imagePreview: true, localEcho: true },
    buffer,
    parseYouTubeID: () => false
  });
  const orig = {
    window: globalThis.window,
    document: globalThis.document,
    URL: globalThis.URL,
    navigator: globalThis.navigator
  };
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.URL = window.URL;
  let navigatorAssigned = false;
  try {
    globalThis.navigator = window.navigator;
    navigatorAssigned = true;
  } catch {
    navigatorAssigned = false;
  }
  t?.after(() => {
    globalThis.window = orig.window;
    globalThis.document = orig.document;
    globalThis.URL = orig.URL;
    if (navigatorAssigned) {
      globalThis.navigator = orig.navigator;
    }
  });
  await import("../../src/client/u-buttons.js");
  return { window, dome };
};

test("attachImage injects linked image", async (t) => {
  const { window, dome } = await setupWindow(t);
  dome.setupButtons();
  const span = window.document.createElement("span");
  dome.attachImage(span, "img1", "https://example.com/image.png");
  const html = span.innerHTML;
  assert.ok(html.startsWith("<br><a href=\"https://example.com/image.png\""));
  assert.ok(html.endsWith("</a><br>"));
  const img = span.querySelector("img");
  assert.equal(img?.id, "img1");
  assert.equal(img?.getAttribute("src"), "https://example.com/image.png");
  assert.ok(img?.classList.contains("shown-image"));
  assert.equal(span.querySelector("a")?.getAttribute("href"), "https://example.com/image.png");
});

test("toggleImage shows and hides images", async (t) => {
  const { window, dome } = await setupWindow(t);
  dome.setupButtons();
  const span = window.document.createElement("span");
  span.id = "simg1";
  dome.buffer.append(span);
  const control = window.document.createElement("i");
  control.className = "icon-chevron-up";

  dome.toggleImage(control, "img1", "https://example.com/img.png");
  assert.ok(control.classList.contains("icon-chevron-down"));
  assert.ok(span.querySelectorAll("img").length > 0);

  dome.toggleImage(control, "img1", "https://example.com/img.png");
  assert.ok(control.classList.contains("icon-chevron-up"));
  assert.equal(span.innerHTML, "");
});


test("clear button empties buffer", async (t) => {
  const { window, dome } = await setupWindow(t);
  const btn = window.document.createElement("button");
  window.document.body.appendChild(btn);
  dome.clearButton = btn;
  dome.buffer.innerHTML = "abc";
  dome.setupButtons();
  btn.click();
  assert.equal(dome.buffer.innerHTML, "");
});

test("scroll button triggers handler", async (t) => {
  const { window, dome } = await setupWindow(t);
  const btn = window.document.createElement("button");
  window.document.body.appendChild(btn);
  dome.scrollButton = btn;
  dome.onToggleAutoScroll = t.mock.fn();
  dome.setupButtons();
  btn.click();
  assert.equal(dome.onToggleAutoScroll.mock.callCount(), 1);
});

test("options button toggles overlay", async () => {
  const { window, dome } = await setupWindow();
  const button = window.document.createElement("button");
  button.id = "button-client-options";
  const overlay = window.document.createElement("div");
  overlay.id = "client-options-overlay";
  overlay.className = "hide";
  window.document.body.append(button, overlay);
  dome.clientOptionsButton = button;
  dome.clientOptionsOverlay = overlay;

  dome.setupButtons();

  button.click();
  assert.ok(!overlay.classList.contains("hide"));

  overlay.click();
  assert.ok(overlay.classList.contains("hide"));
});

test("options overlay closes on escape key", async () => {
  const { window, dome } = await setupWindow();
  const button = window.document.createElement("button");
  button.id = "button-client-options";
  const overlay = window.document.createElement("div");
  overlay.id = "client-options-overlay";
  overlay.className = "hide";
  window.document.body.append(button, overlay);
  dome.clientOptionsButton = button;
  dome.clientOptionsOverlay = overlay;

  dome.setupButtons();

  button.click();
  assert.ok(!overlay.classList.contains("hide"));

  window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
  assert.ok(overlay.classList.contains("hide"));
});

test("save button downloads HTML log", async (t) => {
  const { window, dome } = await setupWindow(t);
  window.__LOG_EXPORT_CSS__ = "body { background: #000; }";
  const btn = window.document.createElement("button");
  window.document.body.appendChild(btn);
  dome.saveButton = btn;
  dome.buffer.innerHTML = "<p>log</p>";

  window.URL.createObjectURL = () => {
    throw new Error("Expected URL.createObjectURL to be mocked");
  };
  window.URL.revokeObjectURL = () => {};

  let capturedBlob;
  const createObjectURL = t.mock.method(window.URL, "createObjectURL", (blob) => {
    capturedBlob = blob;
    return "blob:mock";
  });
  const revokeObjectURL = t.mock.method(window.URL, "revokeObjectURL", () => {});

  const appendedAnchors = [];
  const originalAppend = window.document.body.appendChild;
  t.mock.method(window.document.body, "appendChild", function(element) {
    if (element.tagName === "A") {
      t.mock.method(element, "click");
      appendedAnchors.push(element);
    }
    return originalAppend.call(this, element);
  });

  dome.setupButtons();
  btn.click();

  assert.equal(createObjectURL.mock.callCount(), 1);
  assert.equal(revokeObjectURL.mock.callCount(), 1);
  assert.equal(appendedAnchors.length, 1);
  const anchor = appendedAnchors[0];
  assert.ok(anchor);
  assert.equal(anchor.href, "blob:mock");
  assert.ok(anchor.download.startsWith("game.log."));
  assert.equal(anchor.click.mock.callCount(), 1);
  assert.equal(window.document.body.contains(anchor), false);

  assert.equal(capturedBlob?.type, "text/html;charset=utf-8");
  const blobText = await capturedBlob.text();
  assert.equal(blobText, buildLogHtml("<p>log</p>", "body { background: #000; }"));

  assert.equal(revokeObjectURL.mock.calls[0]?.arguments[0], "blob:mock");
  assert.equal(btn.disabled, false);
});

test("save button supports legacy linked stylesheet log mode", async (t) => {
  const { window, dome } = await setupWindow(t);
  window.__LOG_EXPORT_CSS__ = "body { background: #000; }";
  const btn = window.document.createElement("button");
  window.document.body.appendChild(btn);
  dome.saveButton = btn;
  dome.preferences.inlineLogCss = false;
  dome.buffer.innerHTML = "<p>log</p>";

  window.URL.createObjectURL = () => {
    throw new Error("Expected URL.createObjectURL to be mocked");
  };
  window.URL.revokeObjectURL = () => {};

  let capturedBlob;
  t.mock.method(window.URL, "createObjectURL", (blob) => {
    capturedBlob = blob;
    return "blob:mock";
  });
  t.mock.method(window.URL, "revokeObjectURL", () => {});
  const originalAppend = window.document.body.appendChild;
  t.mock.method(window.document.body, "appendChild", function(element) {
    if (element.tagName === "A") {
      t.mock.method(element, "click");
    }
    return originalAppend.call(this, element);
  });

  dome.setupButtons();
  btn.click();

  const blobText = await capturedBlob.text();
  assert.match(blobText, /https:\/\/www\.sindome\.org\/css\/dome\.css/);
  assert.match(blobText, /https:\/\/play\.sindome\.org\/css\/client\.css/);
  assert.doesNotMatch(blobText, /<style>body \{ background: #000; \}<\/style>/);
});

test("shortcuts button toggles fullscreen overlay", async () => {
  const { window, dome } = await setupWindow();
  const btn = window.document.createElement("button");
  const overlay = window.document.createElement("div");
  overlay.className = "hide";
  window.document.body.append(btn, overlay);
  dome.shortcutsButton = btn;
  dome.shortcutsOverlay = overlay;

  dome.setupButtons();
  btn.click();
  assert.ok(!overlay.classList.contains("hide"));
  overlay.click();
  assert.ok(overlay.classList.contains("hide"));
  assert.equal(btn.disabled, false);
});

test("shortcuts overlay closes on escape key", async () => {
  const { window, dome } = await setupWindow();
  const btn = window.document.createElement("button");
  const overlay = window.document.createElement("div");
  overlay.className = "hide";
  window.document.body.append(btn, overlay);
  dome.shortcutsButton = btn;
  dome.shortcutsOverlay = overlay;

  dome.setupButtons();
  btn.click();
  assert.ok(!overlay.classList.contains("hide"));

  window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
  assert.ok(overlay.classList.contains("hide"));
});

test("reconnect button reinitializes socket without reloading", async (t) => {
  const { window, dome } = await setupWindow();
  const btn = window.document.createElement("button");
  let handler;
  btn.addEventListener = (event, fn) => { if (event === "click") handler = fn; };
  dome.reconnectButton = btn;
  dome.parseSocketData = () => {};
  const emitter = new EventEmitter();
  const onMock = t.mock.method(emitter, "on", () => {});
  dome.setupSocket = t.mock.fn(() => emitter);

  dome.setupButtons();

  let reloadCalled = 0;
  const stubWindow = { location: { reload: () => { reloadCalled++; } } };
  const origWindow = globalThis.window;
  globalThis.window = stubWindow;
  handler();
  globalThis.window = origWindow;

  assert.equal(dome.setupSocket.mock.callCount(), 1);
  assert.equal(onMock.mock.calls[0]?.arguments[0], "data");
  assert.equal(onMock.mock.calls[0]?.arguments[1], dome.parseSocketData);
  assert.equal(reloadCalled, 0);
  assert.equal(btn.disabled, false);
});

test("reconnect button replaces socket and listener", async (t) => {
  const { dome } = await setupWindow(t);
  const btn = document.createElement("button");
  let handler;
  btn.addEventListener = (event, fn) => { if (event === "click") handler = fn; };
  dome.reconnectButton = btn;
  dome.parseSocketData = () => {};
  const sockets = [];
  dome.setupSocket = t.mock.fn(() => {
    const emitter = new EventEmitter();
    emitter.disconnect = () => {};
    t.mock.method(emitter, "disconnect");
    sockets.push(emitter);
    return emitter;
  });

  dome.setupButtons();

  handler();
  handler();
  handler();

  assert.equal(dome.setupSocket.mock.callCount(), 3);
  assert.equal(sockets[0].disconnect.mock.callCount(), 1);
  assert.equal(sockets[0].listenerCount("data"), 0);
  assert.equal(sockets[1].disconnect.mock.callCount(), 1);
  assert.equal(sockets[1].listenerCount("data"), 0);
  assert.equal(sockets[2].listenerCount("data"), 1);
  assert.strictEqual(dome.socket, sockets[2]);
});
