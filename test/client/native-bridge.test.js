import { test } from "node:test";
import assert from "node:assert/strict";
import { SOCKET_STATE_ENUM } from "../../src/client/core/constants.js";
import {
  installDomeBridge,
  notifyNativeBridgeReady,
  startClientSocket
} from "../../src/client/core/native-bridge.js";

test("DomeBridge routes native callbacks and falls back to socket input", (t) => {
  const win = {};
  const socket = { emit: t.mock.fn() };
  const client = {
    health: { showStatus: t.mock.fn() },
    parseSocketData: t.mock.fn(),
    socket
  };

  installDomeBridge({ client, win });

  win.DomeBridge.onData(null);
  win.DomeBridge.onStatus(undefined);
  win.DomeBridge.onError("boom");
  win.DomeBridge.sendInput("look");

  assert.equal(client.parseSocketData.mock.calls[0].arguments[0], "");
  assert.equal(client.health.showStatus.mock.calls[0].arguments[0], "");
  assert.deepEqual(client.health.showStatus.mock.calls[1].arguments, ["ERROR: boom", { persist: true }]);
  assert.deepEqual(socket.emit.mock.calls[0].arguments, ["input", "look"]);
});

test("DomeBridge sends input through native bridge when available", (t) => {
  const win = {
    DomeNative: {
      sendInput: t.mock.fn()
    }
  };
  const client = {
    socket: { emit: t.mock.fn() }
  };

  installDomeBridge({ client, win, hasNativeBridge: true });
  win.DomeBridge.sendInput(null);

  assert.deepEqual(win.DomeNative.sendInput.mock.calls[0].arguments, [""]);
  assert.equal(client.socket.emit.mock.callCount(), 0);
});

test("native bridge readiness ignores handshake and flush failures", (t) => {
  const win = {
    DomeNative: {
      bridgeReady: t.mock.fn(() => {
        throw new Error("handshake failed");
      })
    },
    DomeNativeFlushQueuedEvents: t.mock.fn(() => {
      throw new Error("flush failed");
    })
  };

  assert.doesNotThrow(() => notifyNativeBridgeReady({ win }));
  assert.equal(win.DomeNative.bridgeReady.mock.callCount(), 1);
  assert.equal(win.DomeNativeFlushQueuedEvents.mock.callCount(), 1);
});

test("startClientSocket creates native socket shim and delegates lifecycle calls", (t) => {
  const win = {
    DomeNative: {
      connectNative: t.mock.fn(),
      disconnectNative: t.mock.fn(),
      sendInput: t.mock.fn()
    }
  };
  const client = {};
  const shim = startClientSocket({
    client,
    win,
    hasNativeBridge: true,
    features: { setupSocket() {} }
  });
  const ack = t.mock.fn();
  const noopAck = t.mock.fn();

  shim.emit("input", null, ack);
  shim.emit("status", "ignored", noopAck);
  shim.connect();
  shim.disconnect();
  shim.on();
  shim.off();

  assert.equal(client.socket, shim);
  assert.equal(client.socketState, SOCKET_STATE_ENUM.CONNECTED);
  assert.deepEqual(win.DomeNative.sendInput.mock.calls[0].arguments, [""]);
  assert.deepEqual(ack.mock.calls[0].arguments, [{ status: "command sent" }]);
  assert.deepEqual(noopAck.mock.calls[0].arguments, [{ status: "ok" }]);
  assert.equal(win.DomeNative.connectNative.mock.callCount(), 1);
  assert.equal(win.DomeNative.disconnectNative.mock.callCount(), 1);
});

test("startClientSocket schedules browser socket setup", (t) => {
  const registered = {};
  const client = { parseSocketData: t.mock.fn() };
  const socket = {
    on: t.mock.fn((event, handler) => {
      registered[event] = handler;
    })
  };
  const win = {
    setTimeout(callback, delay) {
      assert.equal(delay, 500);
      callback();
    }
  };
  const features = {
    setupSocket: t.mock.fn(() => socket)
  };

  const result = startClientSocket({ client, doc: {}, win, features });
  registered.data("payload");

  assert.equal(result, null);
  assert.equal(client.socket, socket);
  assert.equal(features.setupSocket.mock.callCount(), 1);
  assert.equal(client.parseSocketData.mock.calls[0].arguments[0], "payload");
});
