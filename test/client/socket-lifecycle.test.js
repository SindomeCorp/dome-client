import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { JSDOM } from "jsdom";
import { dome, SOCKET_STATE_ENUM, logger } from "../../src/client/b-variables.js";
import { store as clientStore } from "../../src/client/store.js";

const { window } = new JSDOM(`<!doctype html><html><body>
  <div id="disconnect-overlay" class="hide"></div>
  <div class="disconnect-buttons hide"></div>
  <input id="inputBuffer" />
  <span id="statusMsg"></span>
</body></html>`, { url: "http://example.com", pretendToBeVisual: true });

const orig = {
  window: globalThis.window,
  document: globalThis.document,
  socketUrl: globalThis.socketUrl,
  socketUrlSSL: globalThis.socketUrlSSL,
  gameName: globalThis.gameName,
  poweredBy: globalThis.poweredBy
};

globalThis.window = window;
globalThis.document = window.document;

dome.disconnectView = {

  overlay: window.document.querySelector("#disconnect-overlay"),
  buttonGroup: window.document.querySelector(".disconnect-buttons")

};

dome.socketState = SOCKET_STATE_ENUM.BEFORE_FIRST;
dome.activeEditor = { readingContent: true };
dome.setFadeText = () => {};

dome.statusDisplay = window.document.querySelector("#statusMsg");
dome.inputReader = window.document.querySelector("#inputBuffer");

dome.preferences = { shortenUrls: false };

Object.assign(clientStore, { get: () => null, remove: () => {}, put: () => {} });
await import("../../src/client/c-preferences.js");
globalThis.socketUrl = "http://sock";
globalThis.socketUrlSSL = "https://sock";
globalThis.gameName = "Game";
globalThis.poweredBy = "Powered";
dome.setWindowTitle = () => {};
dome.onErrorHandler = () => {};
let currentEmitter;
mock.module("socket.io-client", { namedExports: { io: () => currentEmitter } });

dome.alert = {};

test.after(() => {
  globalThis.window = orig.window;
  globalThis.document = orig.document;
  if (orig.socketUrl === undefined) delete globalThis.socketUrl; else globalThis.socketUrl = orig.socketUrl;
  if (orig.socketUrlSSL === undefined) delete globalThis.socketUrlSSL; else globalThis.socketUrlSSL = orig.socketUrlSSL;
  if (orig.gameName === undefined) delete globalThis.gameName; else globalThis.gameName = orig.gameName;
  if (orig.poweredBy === undefined) delete globalThis.poweredBy; else globalThis.poweredBy = orig.poweredBy;
});

test("socket lifecycle updates state and disconnect view", async (t) => {
  const origTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => { fn(); };
  t.after(() => {
    globalThis.setTimeout = origTimeout;
    t.mock.restoreAll();
  });

  currentEmitter = new EventEmitter();
  currentEmitter.disconnect = () => {};

  await import(`../../src/client/g-socket-lifecycle.js?cache=${Math.random()}`);

  const ioSocket = dome.setupSocket();

  ioSocket.emit("connected");
  assert.equal(dome.socketState, SOCKET_STATE_ENUM.CONNECTED);
  assert.ok(dome.disconnectView.overlay.classList.contains("hide"));
  assert.ok(dome.disconnectView.buttonGroup.classList.contains("hide"));

  ioSocket.emit("disconnected");
  assert.equal(dome.socketState, SOCKET_STATE_ENUM.DISCONNECTED);
  assert.ok(!dome.disconnectView.overlay.classList.contains("hide"));
  assert.ok(!dome.disconnectView.buttonGroup.classList.contains("hide"));

  ioSocket.emit("reconnect_failed");
  assert.equal(dome.socketState, SOCKET_STATE_ENUM.RECONNECT_FAILED);
  assert.ok(!dome.disconnectView.overlay.classList.contains("hide"));
  assert.ok(!dome.disconnectView.buttonGroup.classList.contains("hide"));
});

const createSocket = async (t) => {
  dome.disconnectView.overlay.classList.add("hide");
  dome.disconnectView.buttonGroup.classList.add("hide");
  dome.socketState = SOCKET_STATE_ENUM.BEFORE_FIRST;
  const origTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => { fn(); };
  currentEmitter = new EventEmitter();
  currentEmitter.disconnect = () => {};
  await import(`../../src/client/g-socket-lifecycle.js?cache=${Math.random()}`);
  const ioSocket = dome.setupSocket();
  const origStore = { get: clientStore.get, remove: clientStore.remove, put: clientStore.put };
  t.after(() => {
    globalThis.setTimeout = origTimeout;
    Object.assign(clientStore, origStore);
  });
  return { ioSocket, emitter: currentEmitter };
};

test("handlers manage reconnect, login branches, and errors", async (t) => {
  {
    const { ioSocket } = await createSocket(t);
    const warnMock = t.mock.method(logger, "warn");
    ioSocket.emit("disconnected");
    assert.equal(warnMock.mock.calls.length, 1);
  }

  {
    const { ioSocket } = await createSocket(t);
    ioSocket.emit("disconnected");
    dome.socketState = SOCKET_STATE_ENUM.DISCONNECTED;
    const addMock = t.mock.method(dome.disconnectView.overlay.classList, "add", function(cls) {
      return window.DOMTokenList.prototype.add.call(this, cls);

    });
    ioSocket.emit("connected");
    assert.ok(dome.disconnectView.overlay.classList.contains("hide"));
    assert.equal(addMock.mock.calls[0]?.arguments[0], "hide");
  }

  {
    const { ioSocket, emitter } = await createSocket(t);
    let emitted = false;
    const emitMock = t.mock.method(emitter, "emit", function(event, ...args) {
      const cb = typeof args[args.length - 1] === "function" ? args.pop() : null;
      const res = EventEmitter.prototype.emit.call(this, event, ...args);
      emitted = true;
      if (cb) cb();
      return res;
    });
    Object.assign(clientStore, {
      get: (k) => (k === "dc-initial-command" ? "look" : null),
      remove: t.mock.fn(() => {
        assert.ok(emitted);
      })
    });
    dome.setWindowTitle = t.mock.fn();
    ioSocket.emit("connected");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(dome.setWindowTitle.mock.calls[0]?.arguments[0], "Guest | Game | Powered");
    const inputCall = emitMock.mock.calls.find((c) => c.arguments[0] === "input");
    assert.ok(inputCall);
    assert.equal(typeof inputCall.arguments[2], "function");
    assert.equal(clientStore.remove.mock.calls[0]?.arguments[0], "dc-initial-command");
  }

  {
    const { ioSocket, emitter } = await createSocket(t);
    dome.preferences.shortenUrls = true;
    const removeMock = t.mock.fn();
    Object.assign(clientStore, {
      get: (k) => {
        if (k === "dc-user-login") return "login";
        if (k === "last-username") return "User";
        return null;
      },
      remove: removeMock
    });
    const emitMock = t.mock.method(emitter, "emit", function(event, ...args) {
      const cb = typeof args[args.length - 1] === "function" ? args.pop() : null;
      const res = EventEmitter.prototype.emit.call(this, event, ...args);
      if (cb) cb();
      return res;
    });
    dome.setWindowTitle = t.mock.fn();
    dome.onErrorHandler = t.mock.fn();
    ioSocket.emit("connected");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(dome.setWindowTitle.mock.calls[0]?.arguments[0], "User | Game | Powered");
    const events = emitMock.mock.calls.map((c) => c.arguments[0]);
    assert.ok(events.includes("input"));
    assert.ok(events.includes("shorten-on"));
    assert.equal(removeMock.mock.calls[0]?.arguments[0], "dc-user-login");
    const err = new Error("boom");
    ioSocket.emit("error", err);
    assert.equal(dome.onErrorHandler.mock.calls[0]?.arguments[0], err);
  }

  {
    const { ioSocket } = await createSocket(t);
    dome.setWindowTitle = t.mock.fn();
    Object.assign(clientStore, {
      get: (k) => {
        if (k === "dc-user-login") return "login";
        if (k === "last-username") return "User(1)";
        return null;
      },
      remove: () => {}
    });
    dome.alert = {};
    ioSocket.emit("connected");
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(dome.alert.pattern instanceof RegExp);
    assert.equal(dome.alert.pattern.source, "User\\(1\\)");
    assert.ok(dome.alert.pattern.test("User(1)"));
  }
});

test("toggling shortenUrls after connection emits event", async (t) => {
  const { ioSocket, emitter } = await createSocket(t);
  dome.preferences.shortenUrls = false;
  const emitMock = t.mock.method(emitter, "emit", function(event, ...args) {
    return EventEmitter.prototype.emit.call(this, event, ...args);
  });
  ioSocket.emit("connected");
  dome.setClientOption("shortenUrls", true);
  assert.ok(emitMock.mock.calls.some((c) => c.arguments[0] === "shorten-on"));
});

test("setupSocket disconnects existing socket", async (t) => {
  const oldEmitter = new EventEmitter();
  oldEmitter.disconnect = () => {};
  t.mock.method(oldEmitter, "disconnect");
  dome.socket = oldEmitter;
  currentEmitter = new EventEmitter();
  currentEmitter.connected = false;
  currentEmitter.disconnect = () => {};
  await import(`../../src/client/g-socket-lifecycle.js?cache=${Math.random()}`);
  const newSocket = dome.setupSocket();
  assert.equal(oldEmitter.disconnect.mock.callCount(), 1);
  assert.equal(newSocket.connected, false);
  assert.strictEqual(newSocket, currentEmitter);
});
