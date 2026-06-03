import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { MOO_STATUS_ENUM, SOCKET_STATE_ENUM, logger } from "../../src/client/b-variables.js";
import { createClientState } from "../../src/client/client-state.js";

const flushPromises = () => new Promise(resolve => setImmediate(resolve));

async function setup(t, { perfBuffer = 0, withHealthDom = true } = {}) {
  const dome = createClientState();
  const dom = new JSDOM(`<!doctype html><html><body>
    ${withHealthDom ? "<div id=\"gameHealth\"></div><div id=\"gameHealthDetail\"></div>" : ""}
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
  window.HTMLCanvasElement.prototype.getContext = () => ({ canvas: {} });

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
  let intervalId = null;
  const clearIntervalCalls = [];
  const origInterval = globalThis.setInterval;
  const origClearInterval = globalThis.clearInterval;
  globalThis.setInterval = t.mock.fn(fn => {
    intervalFn = fn;
    intervalId = 100;
    return intervalId;
  });
  globalThis.clearInterval = t.mock.fn(id => clearIntervalCalls.push(id));

  let nextTimeoutId = 1;
  const timeoutFns = [];
  const clearedTimeouts = [];
  const origTimeout = globalThis.setTimeout;
  const origClearTimeout = globalThis.clearTimeout;
  window.setTimeout = globalThis.setTimeout = t.mock.fn(fn => {
    const id = nextTimeoutId++;
    timeoutFns.push({ id, fn });
    return id;
  });
  window.clearTimeout = globalThis.clearTimeout = t.mock.fn(id => {
    clearedTimeouts.push(id);
  });

  const graphs = [];
  globalThis.__healthTestGraphs = graphs;
  t.mock.module("../../src/client/x-bar-graph.js", {
    defaultExport: class {
      constructor() {
        this.update = t.mock.fn();
        globalThis.__healthTestGraphs.push(this);
      }
    }
  });

  t.after(() => {
    globalThis.setInterval = origInterval;
    globalThis.clearInterval = origClearInterval;
    globalThis.setTimeout = origTimeout;
    globalThis.clearTimeout = origClearTimeout;
    window.setTimeout = origTimeout;
    window.clearTimeout = origClearTimeout;
    globalThis.fetch = origFetch;
    window.fetch = origFetch;
    delete globalThis.__healthTestGraphs;
    t.mock.restoreAll();
  });

  const { setupHealthCheck } = await import(`../../src/client/y-health.js?cachebust=${Date.now()}-${Math.random()}`);
  const health = setupHealthCheck({ client: dome, doc: document });
  return {
    window,
    dome,
    health,
    animate,
    intervalFn: () => intervalFn(),
    timeoutFns,
    clearedTimeouts,
    clearIntervalCalls,
    graphs,
    loggerInfo,
    loggerError,
    getFetchCallbacks: () => fetchCalls.shift()
  };
}

const resolveHealth = async (fetchCallbacks, payload) => {
  fetchCallbacks.resolve({ json: () => Promise.resolve(payload) });
  await flushPromises();
};

test("setupHealthCheck is a no-op when health DOM is absent", async (t) => {
  const { dome, health } = await setup(t, { withHealthDom: false });

  assert.equal(health, undefined);
  assert.equal(dome.health, undefined);
});

test("showStatus uppercases, persists, cancels previous animations, and ignores aborts", async (t) => {
  const { dome, health, window } = await setup(t);

  let rejectFirst;
  const cancels = [];
  window.Element.prototype.animate = function(frames) {
    if (this !== dome.statusDisplay) {
      return { cancel() {}, finished: Promise.resolve() };
    }
    const finished = new Promise((resolve, reject) => {
      rejectFirst = reject;
      if (frames[0].opacity === 1) {
        resolve();
      }
    });
    return {
      cancel: () => {
        cancels.push(frames);
        rejectFirst?.(new DOMException("The operation was aborted"));
      },
      finished
    };
  };

  const unhandled = [];
  const handler = reason => { unhandled.push(reason); };
  process.on("unhandledrejection", handler);
  t.after(() => { process.off("unhandledrejection", handler); });

  health.showStatus("first");
  health.showStatus("second", { persist: true });
  await flushPromises();

  assert.equal(dome.statusDisplay.innerHTML, "SECOND");
  assert.equal(cancels.length, 1);
  assert.equal(unhandled.length, 0);
});

test("handleSocketError diagnoses disconnected sockets and preserves connected error messages", async (t) => {
  const { dome, health, loggerInfo, loggerError } = await setup(t);

  dome.gameHealth.cpu = 99;
  health.handleSocketError({ code: "ETIMEOUT" });
  assert.equal(
    dome.statusDisplay.innerHTML,
    "ERROR: THE MOO IS UNDER HEAVY LOAD AND MIGHT NOT BE ABLE TO RESPOND IN A TIMELY MANNER"
  );
  assert.match(loggerInfo.mock.calls[0].arguments[0], /LAG/);

  dome.gameHealth.cpu = 0;
  health.handleSocketError({ code: "ENOTFOUND" });
  assert.equal(
    dome.statusDisplay.innerHTML,
    "ERROR: UNABLE TO REACH WEBCLIENT SERVER VIA SOCKET, CHECK YOUR INTERNET CONNECTION"
  );
  assert.match(loggerInfo.mock.calls[1].arguments[0], /NETWORK/);

  health.handleSocketError({ code: "ECONNREFUSED" });
  assert.equal(
    dome.statusDisplay.innerHTML,
    "ERROR: SOCKET CONNECTION REFUSED, BEHIND A STRICT COMPANY OR SCHOOL FIREWALL?"
  );
  assert.match(loggerInfo.mock.calls[2].arguments[0], /CHECK_FIREWALL/);

  dome.gameHealth.state = MOO_STATUS_ENUM.MOO_OFFLINE;
  dome.gameHealth.message = "moo offline";
  health.handleSocketError({ code: "EOTHER" });
  assert.equal(dome.statusDisplay.innerHTML, "ERROR: MOO OFFLINE");

  dome.gameHealth.state = MOO_STATUS_ENUM.UNCHECKED;
  health.handleSocketError({ code: "ENOTFOUND" });
  assert.equal(dome.statusDisplay.innerHTML, "ERROR: MOO OFFLINE");

  dome.socketState = SOCKET_STATE_ENUM.CONNECTED;
  health.handleSocketError({ msg: "custom" });
  health.handleSocketError({ code: "ECODE" });
  assert.equal(dome.statusDisplay.innerHTML, "ERROR: ECODE");
  assert.equal(loggerError.mock.calls.length, 7);
});

test("showPanel, hidePanel, and togglePanel preserve animation frames", async (t) => {
  const { dome, health, timeoutFns, animate, window } = await setup(t);

  const flushTimeouts = () => {
    while (timeoutFns.length) {
      timeoutFns.shift().fn();
    }
  };

  health.togglePanel();
  flushTimeouts();
  assert.deepEqual(animate.mock.calls[0].arguments[0], [
    { left: "-152px" },
    { left: "0px" }
  ]);
  assert.equal(window.getComputedStyle(dome.healthDetail).left, "0px");

  health.togglePanel();
  flushTimeouts();
  assert.deepEqual(animate.mock.calls[1].arguments[0], [
    { left: "0px" },
    { left: "-152px" }
  ]);
  assert.equal(window.getComputedStyle(dome.healthDetail).left, "-152px");

  health.showPanel();
  flushTimeouts();
  health.hidePanel();
  flushTimeouts();
  assert.deepEqual(animate.mock.calls.at(-1).arguments[0], [
    { left: "0px" },
    { left: "-152px" }
  ]);
});

test("panel hover delays hide until leaving both icon and detail", async (t) => {
  const { dome, health, window, timeoutFns } = await setup(t);

  const flushOne = () => timeoutFns.shift().fn();
  health.showPanel();
  flushOne();

  dome.healthDisplay.dispatchEvent(new window.MouseEvent("mouseleave", { relatedTarget: dome.healthDetail }));
  dome.healthDetail.dispatchEvent(new window.MouseEvent("mouseleave", { relatedTarget: dome.healthDisplay }));
  assert.equal(timeoutFns.length, 0);

  dome.healthDisplay.dispatchEvent(new window.MouseEvent("mouseleave", { relatedTarget: null }));
  assert.equal(timeoutFns.length, 1);
  assert.equal(dome.healthDetail.style.left, "0px");
  flushOne();
  flushOne();
  assert.equal(dome.healthDetail.style.left, "-152px");
});

test("refreshStatus handles success payloads, graph updates, globe classes, and perf buffer flag", async (t) => {
  const { dome, health, graphs, getFetchCallbacks } = await setup(t, { perfBuffer: 42 });

  await resolveHealth(getFetchCallbacks(), {
    cpu: 10,
    memory: 1048576,
    users: 5,
    state: MOO_STATUS_ENUM.OK,
    message: "all good",
    checked: 0
  });
  assert.ok(dome.healthDisplay.innerHTML.includes("globe-ok"));
  assert.match(dome.healthDetail.querySelector(".last-details").innerHTML, /5 users connected/);
  assert.equal(graphs[0].update.mock.calls[0].arguments[0].length, 100);
  assert.equal(graphs[1].update.mock.calls[0].arguments[0].length, 100);
  assert.equal(graphs[2].update.mock.calls[0].arguments[0].length, 100);
  assert.equal(dome.gameHealth.length, 1);

  const refresh = health.refreshStatus();
  await resolveHealth(getFetchCallbacks(), {
    cpu: 99,
    memory: 2097152,
    users: 10,
    state: MOO_STATUS_ENUM.OK,
    message: "busy",
    checked: 0
  });
  await refresh;
  assert.ok(dome.healthDisplay.innerHTML.includes("globe-warn"));
  assert.equal(dome.statusDisplay.innerHTML, "BUSY");
  assert.equal(
    dome.perfBufferFlag.getAttribute("title"),
    "Scrollback limited to 42 lines"
  );
  assert.equal(dome.perfBufferFlag.classList.contains("hide"), false);
});

test("refreshStatus handles fetch failures and recovers", async (t) => {
  const { dome, health, graphs, loggerError, getFetchCallbacks } = await setup(t);

  getFetchCallbacks().reject({ code: "ENOTFOUND" });
  await flushPromises();
  assert.ok(dome.healthDisplay.innerHTML.includes("globe-fatal"));
  assert.equal(
    dome.statusDisplay.innerHTML,
    "UNABLE TO REACH WEBCLIENT SERVER, CHECK YOUR INTERNET CONNECTION"
  );

  const cases = [
    ["ETIMEDOUT", "UNABLE TO REACH WEBCLIENT SERVER AFTER A REASONABLE TIME, SERVER MAY BE OFFLINE"],
    ["ECONNREFUSED", "SERVER CONNECTION REFUSED, BEHIND A STRICT COMPANY OR SCHOOL FIREWALL?"],
    ["EOTHER", "ERROR WHILE CONNECTING TO WEBCLIENT SERVER: EOTHER"]
  ];

  for (const [code, msg] of cases) {
    const refresh = health.refreshStatus();
    getFetchCallbacks().reject({ code });
    await refresh;
    assert.equal(dome.statusDisplay.innerHTML, msg);
  }

  const refresh = health.refreshStatus();
  await resolveHealth(getFetchCallbacks(), {
    cpu: 0,
    memory: 0,
    users: 0,
    state: MOO_STATUS_ENUM.OK,
    message: "ok",
    checked: 0
  });
  await refresh;
  assert.ok(dome.healthDisplay.innerHTML.includes("globe-ok"));
  assert.equal(dome.statusDisplay.innerHTML, "OK");
  assert.equal(loggerError.mock.calls.length, 4);
  assert.equal(graphs[0].update.mock.callCount(), 5);
});

test("refreshStatus handles each MOO status", async (t) => {
  const cases = [
    { state: MOO_STATUS_ENUM.UNCHECKED, class: "ok", status: "" },
    { state: MOO_STATUS_ENUM.UNKNOWN, class: "fatal", status: "UNKNOWN" },
    { state: MOO_STATUS_ENUM.OK, class: "ok", status: "" },
    { state: MOO_STATUS_ENUM.WEBCLIENT_DOWN, class: "fatal", status: "CLIENT_DOWN" },
    { state: MOO_STATUS_ENUM.WEBSITE_DOWN, class: "fatal", status: "SITE_DOWN" },
    { state: MOO_STATUS_ENUM.MOO_OFFLINE, class: "fatal", status: "MOO_DOWN" },
    { state: MOO_STATUS_ENUM.SEVERE_LAG, class: "fatal", status: "LAG" },
    { state: MOO_STATUS_ENUM.NETWORK_ISSUE, class: "fatal", status: "NETWORK" }
  ];

  for (const item of cases) {
    await t.test(item.state, async t => {
      const { dome, getFetchCallbacks } = await setup(t);
      await resolveHealth(getFetchCallbacks(), {
        cpu: 0,
        memory: 0,
        users: 0,
        state: item.state,
        message: item.state.toLowerCase(),
        checked: 0
      });

      assert.ok(dome.healthDisplay.innerHTML.includes(`globe-${item.class}`));
      assert.equal(dome.statusDisplay.innerHTML, item.status);
    });
  }
});

test("destroy removes event listeners and clears timers", async (t) => {
  const {
    dome,
    health,
    window,
    timeoutFns,
    clearedTimeouts,
    clearIntervalCalls
  } = await setup(t);

  health.showPanel();
  dome.healthDisplay.dispatchEvent(new window.MouseEvent("mouseleave", { relatedTarget: null }));
  assert.ok(timeoutFns.length > 0);

  health.destroy();
  assert.deepEqual(clearIntervalCalls, [100]);
  assert.ok(clearedTimeouts.length > 0);

  const pendingBefore = timeoutFns.length;
  dome.healthDisplay.dispatchEvent(new window.MouseEvent("mouseover"));
  assert.equal(timeoutFns.length, pendingBefore);
});
