import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createClientState } from "../../src/client/client-state.js";
import { setupAutoscroll } from "../../src/client/t-autoscroll.js";

const client = createClientState();

test.afterEach(() => {
  delete globalThis.window;
  delete globalThis.document;
});

const html = `<!doctype html><html><body>
  <div id="buffer"></div>
  <button id="scrollButton"></button>
  <span id="status"></span>
  <input id="inputBuffer" />
  <input id="lineBuffer" />
</body></html>`;

test("none mode toggle updates DOM and state", async () => {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;
  globalThis.window = window;
  globalThis.document = document;
  Object.assign(client, {
    buffer: document.querySelector("#buffer"),
    scrollButton: document.querySelector("#scrollButton"),
    statusDisplay: document.querySelector("#status"),
    preferences: { autoScroll: "none" }
  });

  setupAutoscroll({ client, win: window, doc: document });

  client.buffer.scrollTop = 0;
  Object.defineProperty(client.buffer, "scrollHeight", { value: 100, configurable: true });
  client.scrollBuffer();
  assert.equal(client.buffer.scrollTop, 100);
  assert.equal(client.pausedLines, 0);

  client.pauseBuffer = true;
  client.buffer.scrollTop = 0;
  client.scrollBuffer();
  assert.equal(client.buffer.scrollTop, 0);
  assert.equal(client.pausedLines, 1);

  client.pauseBuffer = false;
  client.pausedLines = 0;

  client.onToggleAutoScroll();
  assert.equal(client.pauseBuffer, true);
  assert.ok(client.buffer.classList.contains("scroll-disabled"));
  assert.ok(client.scrollButton.classList.contains("btn-danger"));
  assert.equal(client.scrollButton.querySelector("span.hidden-xs").textContent, "RESUME SCROLL");

  client.onToggleAutoScroll();
  assert.equal(client.pauseBuffer, false);
  assert.ok(!client.buffer.classList.contains("scroll-disabled"));
  assert.ok(client.scrollButton.classList.contains("btn-primary"));
  assert.equal(client.scrollButton.querySelector("span.hidden-xs").textContent, "PAUSE SCROLL");
});

test("changing autoScroll to none removes dblclick handler", async () => {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;
  globalThis.window = window;
  globalThis.document = document;
  const clientLocal = {
    buffer: document.querySelector("#buffer"),
    scrollButton: document.querySelector("#scrollButton"),
    statusDisplay: document.querySelector("#status"),
    preferences: { autoScroll: "dbl" }
  };

  setupAutoscroll(clientLocal, window);

  clientLocal.buffer.dispatchEvent(new window.Event("dblclick"));
  assert.equal(clientLocal.pauseBuffer, true);

  clientLocal.preferences.autoScroll = "none";
  setupAutoscroll(clientLocal, window);

  clientLocal.pauseBuffer = false;
  clientLocal.buffer.dispatchEvent(new window.Event("dblclick"));
  assert.equal(clientLocal.pauseBuffer, false);
});

test("dbl mode scroll calculation and user scroll disables auto-scroll", async () => {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;
  globalThis.window = window;
  globalThis.document = document;
  const clientLocal = {
    buffer: document.querySelector("#buffer"),
    scrollButton: document.querySelector("#scrollButton"),
    statusDisplay: document.querySelector("#status"),
    preferences: { autoScroll: "dbl" }
  };

  const { setupAutoscroll } = await import("../../src/client/t-autoscroll.js");
  setupAutoscroll(clientLocal, window);

  clientLocal.buffer.scrollTop = 0;
  Object.defineProperty(clientLocal.buffer, "scrollHeight", { value: 150, configurable: true });
  clientLocal.scrollBuffer();
  assert.equal(clientLocal.buffer.scrollTop, 150);

  clientLocal.buffer.dispatchEvent(new window.Event("dblclick"));
  assert.equal(clientLocal.pauseBuffer, true);

  clientLocal.buffer.scrollTop = 25;
  clientLocal.buffer.dispatchEvent(new window.Event("mouseover"));
  clientLocal.buffer.dispatchEvent(new window.Event("scroll"));
  clientLocal.scrollBuffer();
  assert.equal(clientLocal.buffer.scrollTop, 25);
  assert.equal(clientLocal.pausedLines, 1);

  clientLocal.buffer.dispatchEvent(new window.Event("dblclick"));
  clientLocal.buffer.scrollTop = 0;
  clientLocal.pausedLines = 0;
  clientLocal.scrollBuffer();
  assert.equal(clientLocal.buffer.scrollTop, 150);
});

test("long mode scroll calculation and user scroll disables auto-scroll", async () => {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;
  globalThis.window = window;
  globalThis.document = document;
  const clientLocal = {
    buffer: document.querySelector("#buffer"),
    scrollButton: document.querySelector("#scrollButton"),
    preferences: { autoScroll: "long" }
  };

  let timeoutFn = null;
  let cleared = false;
  window.setTimeout = fn => {
    timeoutFn = fn;
    return 1;
  };
  window.clearTimeout = () => {
    cleared = true;
    timeoutFn = null;
  };

  const { setupAutoscroll } = await import("../../src/client/t-autoscroll.js");
  setupAutoscroll(clientLocal, window);

  clientLocal.buffer.scrollTop = 0;
  Object.defineProperty(clientLocal.buffer, "scrollHeight", { value: 200, configurable: true });
  clientLocal.scrollBuffer();
  assert.equal(clientLocal.buffer.scrollTop, 200);

  clientLocal.buffer.dispatchEvent(new window.Event("mousedown"));
  assert.ok(timeoutFn);

  clientLocal.buffer.dispatchEvent(new window.Event("mouseup"));
  assert.equal(timeoutFn, null);
  assert.ok(cleared);
  assert.equal(clientLocal.pauseBuffer, false);

  cleared = false;
  clientLocal.buffer.dispatchEvent(new window.Event("mousedown"));
  assert.ok(timeoutFn);
  timeoutFn();
  assert.equal(clientLocal.pauseBuffer, true);

  clientLocal.buffer.scrollTop = 80;
  clientLocal.buffer.dispatchEvent(new window.Event("mouseover"));
  clientLocal.buffer.dispatchEvent(new window.Event("scroll"));
  clientLocal.scrollBuffer();
  assert.equal(clientLocal.buffer.scrollTop, 80);
  assert.equal(clientLocal.pausedLines, 1);

  clientLocal.buffer.dispatchEvent(new window.Event("mousedown"));
  timeoutFn();
  clientLocal.buffer.scrollTop = 0;
  clientLocal.pausedLines = 0;
  clientLocal.scrollBuffer();
  assert.equal(clientLocal.buffer.scrollTop, 200);

});

test("scroll up to pause stops autoscroll until user returns to bottom", async () => {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;
  globalThis.window = window;
  globalThis.document = document;
  const clientLocal = {
    buffer: document.querySelector("#buffer"),
    scrollButton: document.querySelector("#scrollButton"),
    statusDisplay: document.querySelector("#status"),
    preferences: { autoScroll: "none", scrollUpToPause: true }
  };

  const { setupAutoscroll } = await import("../../src/client/t-autoscroll.js");
  setupAutoscroll(clientLocal, window);

  Object.defineProperty(clientLocal.buffer, "scrollHeight", { value: 300, configurable: true });
  Object.defineProperty(clientLocal.buffer, "clientHeight", { value: 100, configurable: true });
  clientLocal.buffer.scrollTop = 50;
  clientLocal.buffer.dispatchEvent(new window.Event("scroll"));

  assert.equal(clientLocal.pauseBuffer, true);
  assert.ok(clientLocal.buffer.classList.contains("scroll-disabled"));
  assert.ok(clientLocal.scrollButton.classList.contains("btn-danger"));
  assert.equal(clientLocal.scrollButton.querySelector("span.hidden-xs").textContent, "RESUME SCROLL");

  clientLocal.scrollBuffer();
  assert.equal(clientLocal.buffer.scrollTop, 50);
  assert.equal(clientLocal.pausedLines, 1);

  clientLocal.buffer.scrollTop = 276;
  clientLocal.buffer.dispatchEvent(new window.Event("scroll"));

  assert.equal(clientLocal.pauseBuffer, false);
  assert.equal(clientLocal.pausedLines, 0);
  assert.ok(!clientLocal.buffer.classList.contains("scroll-disabled"));
  assert.ok(clientLocal.scrollButton.classList.contains("btn-primary"));
  assert.equal(clientLocal.scrollButton.querySelector("span.hidden-xs").textContent, "PAUSE SCROLL");

  clientLocal.scrollBuffer();
  assert.equal(clientLocal.buffer.scrollTop, 300);
});

test("scroll up to pause can be disabled", async () => {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;
  globalThis.window = window;
  globalThis.document = document;
  const clientLocal = {
    buffer: document.querySelector("#buffer"),
    scrollButton: document.querySelector("#scrollButton"),
    statusDisplay: document.querySelector("#status"),
    preferences: { autoScroll: "none", scrollUpToPause: false }
  };

  const { setupAutoscroll } = await import("../../src/client/t-autoscroll.js");
  setupAutoscroll(clientLocal, window);

  Object.defineProperty(clientLocal.buffer, "scrollHeight", { value: 300, configurable: true });
  Object.defineProperty(clientLocal.buffer, "clientHeight", { value: 100, configurable: true });
  clientLocal.buffer.scrollTop = 50;
  clientLocal.buffer.dispatchEvent(new window.Event("scroll"));

  assert.equal(clientLocal.pauseBuffer, false);
  assert.ok(!clientLocal.buffer.classList.contains("scroll-disabled"));
});

test("programmatic scroll does not trigger scroll up pause", async () => {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;
  globalThis.window = window;
  globalThis.document = document;
  const clientLocal = {
    buffer: document.querySelector("#buffer"),
    scrollButton: document.querySelector("#scrollButton"),
    statusDisplay: document.querySelector("#status"),
    preferences: { autoScroll: "none", scrollUpToPause: true }
  };

  const { setupAutoscroll } = await import("../../src/client/t-autoscroll.js");
  setupAutoscroll(clientLocal, window);

  Object.defineProperty(clientLocal.buffer, "scrollHeight", { value: 300, configurable: true });
  Object.defineProperty(clientLocal.buffer, "clientHeight", { value: 100, configurable: true });
  clientLocal.scrollBuffer();
  clientLocal.buffer.dispatchEvent(new window.Event("scroll"));

  assert.equal(clientLocal.pauseBuffer, false);
});
