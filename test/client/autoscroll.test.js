import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { dome } from "../../src/client/b-variables.js";

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
  Object.assign(dome, {
    buffer: document.querySelector("#buffer"),
    scrollButton: document.querySelector("#scrollButton"),
    statusDisplay: document.querySelector("#status"),
    preferences: { autoScroll: "none" }
  });

  await import("../../src/client/t-autoscroll.js");
  dome.setupAutoscroll();

  dome.buffer.scrollTop = 0;
  Object.defineProperty(dome.buffer, "scrollHeight", { value: 100, configurable: true });
  dome.scrollBuffer();
  assert.equal(dome.buffer.scrollTop, 100);
  assert.equal(dome.pausedLines, 0);

  dome.pauseBuffer = true;
  dome.buffer.scrollTop = 0;
  dome.scrollBuffer();
  assert.equal(dome.buffer.scrollTop, 0);
  assert.equal(dome.pausedLines, 1);

  dome.pauseBuffer = false;
  dome.pausedLines = 0;

  dome.onToggleAutoScroll();
  assert.equal(dome.pauseBuffer, true);
  assert.ok(dome.buffer.classList.contains("scroll-disabled"));
  assert.ok(dome.scrollButton.classList.contains("btn-danger"));
  assert.equal(dome.scrollButton.querySelector("span.hidden-xs").textContent, "RESUME SCROLL");

  dome.onToggleAutoScroll();
  assert.equal(dome.pauseBuffer, false);
  assert.ok(!dome.buffer.classList.contains("scroll-disabled"));
  assert.ok(dome.scrollButton.classList.contains("btn-primary"));
  assert.equal(dome.scrollButton.querySelector("span.hidden-xs").textContent, "PAUSE SCROLL");
});

test("changing autoScroll to none removes dblclick handler", async () => {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;
  globalThis.window = window;
  globalThis.document = document;
  const domeLocal = {
    buffer: document.querySelector("#buffer"),
    scrollButton: document.querySelector("#scrollButton"),
    statusDisplay: document.querySelector("#status"),
    preferences: { autoScroll: "dbl" }
  };

  const { setupAutoscroll } = await import("../../src/client/t-autoscroll.js");
  setupAutoscroll(domeLocal, window);

  domeLocal.buffer.dispatchEvent(new window.Event("dblclick"));
  assert.equal(domeLocal.pauseBuffer, true);

  domeLocal.preferences.autoScroll = "none";
  setupAutoscroll(domeLocal, window);

  domeLocal.pauseBuffer = false;
  domeLocal.buffer.dispatchEvent(new window.Event("dblclick"));
  assert.equal(domeLocal.pauseBuffer, false);
});

test("dbl mode scroll calculation and user scroll disables auto-scroll", async () => {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;
  globalThis.window = window;
  globalThis.document = document;
  const domeLocal = {
    buffer: document.querySelector("#buffer"),
    scrollButton: document.querySelector("#scrollButton"),
    statusDisplay: document.querySelector("#status"),
    preferences: { autoScroll: "dbl" }
  };

  const { setupAutoscroll } = await import("../../src/client/t-autoscroll.js");
  setupAutoscroll(domeLocal, window);

  domeLocal.buffer.scrollTop = 0;
  Object.defineProperty(domeLocal.buffer, "scrollHeight", { value: 150, configurable: true });
  domeLocal.scrollBuffer();
  assert.equal(domeLocal.buffer.scrollTop, 150);

  domeLocal.buffer.dispatchEvent(new window.Event("dblclick"));
  assert.equal(domeLocal.pauseBuffer, true);

  domeLocal.buffer.scrollTop = 25;
  domeLocal.buffer.dispatchEvent(new window.Event("mouseover"));
  domeLocal.buffer.dispatchEvent(new window.Event("scroll"));
  domeLocal.scrollBuffer();
  assert.equal(domeLocal.buffer.scrollTop, 25);
  assert.equal(domeLocal.pausedLines, 1);

  domeLocal.buffer.dispatchEvent(new window.Event("dblclick"));
  domeLocal.buffer.scrollTop = 0;
  domeLocal.pausedLines = 0;
  domeLocal.scrollBuffer();
  assert.equal(domeLocal.buffer.scrollTop, 150);
});

test("long mode scroll calculation and user scroll disables auto-scroll", async () => {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;
  globalThis.window = window;
  globalThis.document = document;
  const domeLocal = {
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
  setupAutoscroll(domeLocal, window);

  domeLocal.buffer.scrollTop = 0;
  Object.defineProperty(domeLocal.buffer, "scrollHeight", { value: 200, configurable: true });
  domeLocal.scrollBuffer();
  assert.equal(domeLocal.buffer.scrollTop, 200);

  domeLocal.buffer.dispatchEvent(new window.Event("mousedown"));
  assert.ok(timeoutFn);

  domeLocal.buffer.dispatchEvent(new window.Event("mouseup"));
  assert.equal(timeoutFn, null);
  assert.ok(cleared);
  assert.equal(domeLocal.pauseBuffer, false);

  cleared = false;
  domeLocal.buffer.dispatchEvent(new window.Event("mousedown"));
  assert.ok(timeoutFn);
  timeoutFn();
  assert.equal(domeLocal.pauseBuffer, true);

  domeLocal.buffer.scrollTop = 80;
  domeLocal.buffer.dispatchEvent(new window.Event("mouseover"));
  domeLocal.buffer.dispatchEvent(new window.Event("scroll"));
  domeLocal.scrollBuffer();
  assert.equal(domeLocal.buffer.scrollTop, 80);
  assert.equal(domeLocal.pausedLines, 1);

  domeLocal.buffer.dispatchEvent(new window.Event("mousedown"));
  timeoutFn();
  domeLocal.buffer.scrollTop = 0;
  domeLocal.pausedLines = 0;
  domeLocal.scrollBuffer();
  assert.equal(domeLocal.buffer.scrollTop, 200);

});
