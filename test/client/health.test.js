import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { dome, MOO_STATUS_ENUM, SOCKET_STATE_ENUM, logger } from "../../src/client/b-variables.js";

async function setup(t, { perfBuffer = 0 } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="gameHealth"></div>
    <div id="gameHealthDetail"></div>
    <div id="statusMsg"></div>
    <div id="perf-buffer-flag" class="hide"></div>
  </body></html>`, { pretendToBeVisual: true });

  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  const { document } = window;
  const fetchCalls = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = t.mock.fn(() => new Promise((resolve, reject) => {
    fetchCalls.push({ resolve, reject });
  }));
  window.fetch = globalThis.fetch;
  const animate = t.mock.fn(function(frames) {
    const final = Array.isArray(frames) ? frames[frames.length - 1] : frames;
    Object.entries(final).forEach(([prop, value]) => {
      this.style[prop] = value;
    });
    return { cancel() {}, finished: Promise.resolve() };
  });
  window.Element.prototype.animate = animate;
  window.HTMLCanvasElement.prototype.getContext = () => ({});

  const gameHealth = [];
  gameHealth.state = MOO_STATUS_ENUM.OK;
  gameHealth.cpu = 0;
  gameHealth.message = "";
  Object.assign(dome, {
    gameHealth,
    healthDisplay: document.querySelector("#gameHealth"),
    healthDetail: document.querySelector("#gameHealthDetail"),
    statusDisplay: document.querySelector("#statusMsg"),
    perfBufferFlag: document.querySelector("#perf-buffer-flag"),
    preferences: { performanceBuffer: perfBuffer },
    socketState: SOCKET_STATE_ENUM.DISCONNECTED
  });

  const loggerInfo = t.mock.method(logger, "info");
  const loggerError = t.mock.method(logger, "error");

  let intervalFn;

  const origInterval = globalThis.setInterval;
  globalThis.setInterval = t.mock.fn(fn => { intervalFn = fn; return 0; });

  const timeoutFns = [];
  const origTimeout = globalThis.setTimeout;
  window.setTimeout = t.mock.fn(fn => { timeoutFns.push(fn); return 0; });
  globalThis.setTimeout = window.setTimeout;

  const graphs = [];
  t.mock.module("../../src/client/x-bar-graph.js", {
    defaultExport: class {
      constructor() {
        this.update = t.mock.fn();
        graphs.push(this);
      }
    }
  });

  t.after(() => {
    globalThis.setInterval = origInterval;
    globalThis.setTimeout = origTimeout;
    window.setTimeout = origTimeout;
    globalThis.fetch = origFetch;
    window.fetch = origFetch;
    t.mock.restoreAll();
  });

  await import(`../../src/client/y-health.js?cachebust=${Date.now()}`);
  dome.setupHealthCheck();
  return {
    window,
    dome,
    animate,
    intervalFn,
    timeoutFns,
    graphs,
    loggerInfo,
    loggerError,
    getFetchCallbacks: () => fetchCalls.shift()
  };
}


test("troubleshootConnection covers all branches", async (t) => {
  const { dome, loggerInfo } = await setup(t);

  const msgs = [];
  dome.setFadeText = t.mock.fn((elem, msg) => msgs.push(msg));

  dome.gameHealth.cpu = 99;
  dome.onErrorHandler({ code: "ETIMEOUT" });
  assert.equal(
    msgs.shift(),
    "ERROR: the moo is under heavy load and might not be able to respond in a timely manner"
  );
  assert.match(loggerInfo.mock.calls[0].arguments[0], /LAG/);

  dome.gameHealth.cpu = 0;
  dome.onErrorHandler({ code: "ENOTFOUND" });
  assert.equal(
    msgs.shift(),
    "ERROR: unable to reach webclient server via socket, check your Internet connection"
  );
  assert.match(loggerInfo.mock.calls[1].arguments[0], /NETWORK/);

  dome.onErrorHandler({ code: "ETIMEOUT" });
  assert.equal(
    msgs.shift(),
    "ERROR: unable to reach webclient server via socket, check your Internet connection"
  );
  assert.match(loggerInfo.mock.calls[2].arguments[0], /NETWORK/);

  dome.onErrorHandler({ code: "ECONNREFUSED" });
  assert.equal(
    msgs.shift(),
    "ERROR: socket connection refused, behind a strict company or school firewall?"
  );
  assert.match(loggerInfo.mock.calls[3].arguments[0], /CHECK_FIREWALL/);

  dome.onErrorHandler({ code: "EOTHER" });
  assert.equal(
    msgs.shift(),
    "ERROR: unexpected error while opening socket to webclient server: EOTHER"
  );
  assert.match(loggerInfo.mock.calls[4].arguments[0], /NETWORK/);

  dome.gameHealth.state = MOO_STATUS_ENUM.MOO_OFFLINE;
  dome.gameHealth.message = "moo offline";
  dome.onErrorHandler({ code: "EOTHER" });
  assert.equal(msgs.shift(), "ERROR: moo offline");
  assert.match(loggerInfo.mock.calls[5].arguments[0], /MOO_DOWN/);

  dome.gameHealth.state = MOO_STATUS_ENUM.UNCHECKED;
  dome.onErrorHandler({ code: "ENOTFOUND" });
  assert.equal(msgs.length, 0);
  assert.equal(loggerInfo.mock.calls.length, 6);
});


test("onErrorHandler uses message fields and persists", async (t) => {
  const { dome } = await setup(t);
  const calls = [];
  dome.setFadeText = t.mock.fn((elem, msg, persist) => calls.push({ msg, persist }));

  dome.socketState = SOCKET_STATE_ENUM.CONNECTED;
  dome.onErrorHandler({ msg: "custom" });
  dome.onErrorHandler({ code: "ECODE" });

  assert.deepEqual(calls[0], { msg: "ERROR: custom", persist: true });
  assert.deepEqual(calls[1], { msg: "ERROR: ECODE", persist: true });
});


test("toggleGameHealth opens and closes", async (t) => {
  const { dome, window, timeoutFns, animate } = await setup(t);

  const flushTimeouts = () => {
    while (timeoutFns.length) {
      timeoutFns.shift()();
    }
  };

  dome.toggleGameHealth();
  flushTimeouts();
  assert.deepEqual(animate.mock.calls[0].arguments[0], [
    { left: "-152px" },
    { left: "0px" }
  ]);
  assert.equal(window.getComputedStyle(dome.healthDetail).left, "0px");

  dome.toggleGameHealth();
  flushTimeouts();
  assert.deepEqual(animate.mock.calls[1].arguments[0], [
    { left: "0px" },
    { left: "-152px" }
  ]);
  assert.equal(window.getComputedStyle(dome.healthDetail).left, "-152px");
});


test("setGameHealthDisplay updates globe and graphs", async (t) => {
  const { dome, graphs, getFetchCallbacks, intervalFn, window, timeoutFns } = await setup(t);
  const showMock = t.mock.method(dome, "showGameHealth", dome.showGameHealth);
  const hideMock = t.mock.method(dome, "hideGameHealth", dome.hideGameHealth);
  const { resolve } = getFetchCallbacks();
  dome.setFadeText = t.mock.fn();

  resolve({ json: () => Promise.resolve({
    cpu: 10,
    memory: 1048576,
    users: 5,
    state: MOO_STATUS_ENUM.OK,
    message: "all good",
    checked: 0
  }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(dome.healthDisplay.innerHTML.includes("globe-ok"));
  assert.match(
    dome.healthDetail.querySelector(".last-details").innerHTML,
    /5 users connected/
  );
  assert.equal(graphs[0].update.mock.calls[0].arguments[0].length, 100);
  assert.equal(graphs[1].update.mock.calls[0].arguments[0].length, 100);
  assert.equal(graphs[2].update.mock.calls[0].arguments[0].length, 100);
  dome.healthDisplay.dispatchEvent(new window.MouseEvent("mouseover"));
  timeoutFns.shift()();
  dome.healthDisplay.dispatchEvent(new window.MouseEvent("mouseleave", { relatedTarget: null }));
  assert.equal(showMock.mock.callCount(), 1);
  assert.equal(hideMock.mock.callCount(), 0);
  assert.equal(timeoutFns.length, 1);
  timeoutFns.shift()();
  timeoutFns.shift()();
  assert.equal(hideMock.mock.callCount(), 1);
  showMock.mock.restore();
  hideMock.mock.restore();
  intervalFn();
  const { resolve: resolve2 } = getFetchCallbacks();
  resolve2({ json: () => Promise.resolve({
    cpu: 99,
    memory: 2097152,
    users: 10,
    state: MOO_STATUS_ENUM.OK,
    message: "busy",
    checked: 0
  }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(dome.healthDisplay.innerHTML.includes("globe-warn"));
  assert.equal(dome.setFadeText.mock.calls[0].arguments[1], "busy");
  assert.equal(dome.setFadeText.mock.calls[0].arguments[2], true);
  intervalFn();
  const { resolve: resolve3 } = getFetchCallbacks();
  resolve3({ json: () => Promise.resolve({
    cpu: 0,
    memory: 0,
    users: 0,
    state: MOO_STATUS_ENUM.WEBCLIENT_DOWN,
    message: "down",
    checked: 0
  }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(dome.healthDisplay.innerHTML.includes("globe-fatal"));
  assert.equal(dome.setFadeText.mock.calls[1].arguments[1], "down");
  assert.equal(dome.setFadeText.mock.calls[1].arguments[2], true);
});


test("health overlay hides only when leaving both icon and detail", async (t) => {
  const { dome, window, getFetchCallbacks, timeoutFns } = await setup(t);
  const { resolve } = getFetchCallbacks();
  resolve({ json: () => Promise.resolve({
    cpu: 0,
    memory: 0,
    users: 0,
    state: MOO_STATUS_ENUM.OK,
    message: "ok",
    checked: 0
  }) });
  await new Promise(resolve => setImmediate(resolve));
  dome.showGameHealth();
  timeoutFns.shift()();
  const hideMock = t.mock.method(dome, "hideGameHealth", dome.hideGameHealth);
  dome.healthDisplay.dispatchEvent(new window.MouseEvent("mouseleave", { relatedTarget: dome.healthDetail }));
  assert.equal(hideMock.mock.callCount(), 0);
  dome.healthDetail.dispatchEvent(new window.MouseEvent("mouseleave", { relatedTarget: dome.healthDisplay }));
  assert.equal(hideMock.mock.callCount(), 0);
});

test("health overlay hides after leaving icon area", async (t) => {
  const { dome, window, timeoutFns, getFetchCallbacks } = await setup(t);
  const { resolve } = getFetchCallbacks();
  resolve({ json: () => Promise.resolve({
    cpu: 0,
    memory: 0,
    users: 0,
    state: MOO_STATUS_ENUM.OK,
    message: "ok",
    checked: 0
  }) });
  await new Promise(resolve => setImmediate(resolve));
  dome.showGameHealth();
  timeoutFns.shift()();
  dome.healthDetail.dispatchEvent(new window.MouseEvent("mouseleave", { relatedTarget: dome.healthDisplay }));
  dome.healthDisplay.dispatchEvent(new window.MouseEvent("mouseleave", { relatedTarget: null }));
  assert.equal(timeoutFns.length, 1);
  assert.equal(dome.healthDetail.style.left, "0px");
  timeoutFns.shift()();
  timeoutFns.shift()();
  assert.equal(dome.healthDetail.style.left, "-152px");
});

test("health overlay hides after leaving overlay area", async (t) => {
  const { dome, window, timeoutFns, getFetchCallbacks } = await setup(t);
  const { resolve } = getFetchCallbacks();
  resolve({ json: () => Promise.resolve({
    cpu: 0,
    memory: 0,
    users: 0,
    state: MOO_STATUS_ENUM.OK,
    message: "ok",
    checked: 0
  }) });
  await new Promise(resolve => setImmediate(resolve));
  dome.showGameHealth();
  timeoutFns.shift()();
  dome.healthDetail.dispatchEvent(new window.MouseEvent("mouseleave", { relatedTarget: null }));
  assert.equal(timeoutFns.length, 1);
  assert.equal(dome.healthDetail.style.left, "0px");
  timeoutFns.shift()();
  timeoutFns.shift()();
  assert.equal(dome.healthDetail.style.left, "-152px");
});


test("updateMOOStatus handles perfBuffer and ajax errors", async (t) => {
  const { dome, intervalFn, graphs, loggerError, getFetchCallbacks } = await setup(t);
  dome.setFadeText = t.mock.fn();

  dome.preferences.performanceBuffer = 42;
  intervalFn();
  let { resolve, reject } = getFetchCallbacks();

  resolve({ json: () => Promise.resolve({
    cpu: 1,
    memory: 1,
    users: 1,
    state: MOO_STATUS_ENUM.OK,
    message: "ok",
    checked: 0
  }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(graphs[0].update.mock.callCount(), 1);

  const cases = [
    ["ENOTFOUND", "unable to reach webclient server, check your Internet connection"],
    ["ETIMEDOUT", "unable to reach webclient server after a reasonable time, server may be offline"],
    ["ECONNREFUSED", "server connection refused, behind a strict company or school firewall?"],
    ["EOTHER", "error while connecting to webclient server: EOTHER"]
  ];

  for (const [code, msg] of cases) {
    intervalFn();
    ({ resolve, reject } = getFetchCallbacks());
    reject({ code });
    await new Promise(resolve => setImmediate(resolve));
    const idx = loggerError.mock.calls.length - 1;
    assert.equal(loggerError.mock.calls[idx].arguments[0].code, code);
    assert.equal(dome.setFadeText.mock.calls[idx].arguments[1], msg);
    assert.equal(graphs[0].update.mock.callCount(), idx + 2);
  }

  assert.equal(
    dome.perfBufferFlag.getAttribute("title"),
    "Scrollback limited to 42 lines"
  );
  assert.equal(dome.perfBufferFlag.classList.contains("hide"), false);
});

test("setFadeText ignores aborted animations", async (t) => {
  const { dome, window } = await setup(t);

  window.Element.prototype.animate = function() {
    let reject;
    const finished = new Promise((_, rej) => { reject = rej; });
    return {
      cancel: () => reject(new DOMException("The operation was aborted")),
      finished
    };
  };

  const unhandled = [];
  const handler = reason => { unhandled.push(reason); };
  process.on("unhandledrejection", handler);
  t.after(() => { process.off("unhandledrejection", handler); });

  dome.setFadeText(dome.statusDisplay, "first");
  dome.setFadeText(dome.statusDisplay, "second");

  await new Promise(resolve => setImmediate(resolve));
  assert.equal(unhandled.length, 0);
});

test("updateMOOStatus recovers after failure", async (t) => {
  const { dome, intervalFn, getFetchCallbacks } = await setup(t);
  dome.setFadeText = t.mock.fn();

  intervalFn();
  let fetch = getFetchCallbacks();
  fetch.reject({ code: "ENOTFOUND" });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(dome.healthDisplay.innerHTML.includes("globe-fatal"));
  assert.equal(
    dome.setFadeText.mock.calls[0].arguments[1],
    "unable to reach webclient server, check your Internet connection"
  );

  intervalFn();
  fetch = getFetchCallbacks();
  fetch.resolve({ json: () => Promise.resolve({
    cpu: 0,
    memory: 0,
    users: 0,
    state: MOO_STATUS_ENUM.OK,
    message: "ok",
    checked: 0
  }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(dome.healthDisplay.innerHTML.includes("globe-ok"));
  assert.equal(dome.setFadeText.mock.calls[1].arguments[1], "ok");
  assert.equal(dome.setFadeText.mock.calls[1].arguments[2], false);
});

test("setGameHealthDisplay handles each MOO status", async (t) => {
  const cases = [
    { state: MOO_STATUS_ENUM.UNCHECKED, class: "ok", fades: 0 },
    { state: MOO_STATUS_ENUM.UNKNOWN, class: "fatal", fades: 1 },
    { state: MOO_STATUS_ENUM.OK, class: "ok", fades: 0 },
    { state: MOO_STATUS_ENUM.WEBCLIENT_DOWN, class: "fatal", fades: 1 },
    { state: MOO_STATUS_ENUM.WEBSITE_DOWN, class: "fatal", fades: 1 },
    { state: MOO_STATUS_ENUM.MOO_OFFLINE, class: "fatal", fades: 1 },
    { state: MOO_STATUS_ENUM.SEVERE_LAG, class: "fatal", fades: 1 },
    { state: MOO_STATUS_ENUM.NETWORK_ISSUE, class: "fatal", fades: 1 }
  ];
  for (const { state, class: globe, fades } of cases) {
    await t.test(state, async t => {
      const { dome, getFetchCallbacks } = await setup(t);
      dome.setFadeText = t.mock.fn();
      const { resolve } = getFetchCallbacks();
      resolve({ json: () => Promise.resolve({
        cpu: 0,
        memory: 0,
        users: 0,
        state,
        message: state.toLowerCase(),
        checked: 0
      }) });
      await new Promise(resolve => setImmediate(resolve));
      assert.ok(dome.healthDisplay.innerHTML.includes(`globe-${globe}`));
      assert.equal(dome.setFadeText.mock.calls.length, fades);
      if (fades) {
        assert.equal(dome.setFadeText.mock.calls[0].arguments[1], state.toLowerCase());
        assert.equal(dome.setFadeText.mock.calls[0].arguments[2], true);
      }
    });
  }
});

