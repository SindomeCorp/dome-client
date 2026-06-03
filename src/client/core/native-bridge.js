import { SOCKET_STATE_ENUM } from "./constants.js";

export const installDomeBridge = ({ client, win = globalThis.window, hasNativeBridge = false }) => {
  win.DomeBridge = {
    onData(payload) {
      if (typeof client.parseSocketData === "function") {
        client.parseSocketData(String(payload ?? ""));
      }
    },
    onStatus(payload) {
      client.health?.showStatus(String(payload ?? ""));
    },
    onError(payload) {
      client.health?.showStatus("ERROR: " + String(payload ?? ""), { persist: true });
    },
    sendInput(command) {
      if (hasNativeBridge && win.DomeNative && typeof win.DomeNative.sendInput === "function") {
        win.DomeNative.sendInput(String(command ?? ""));
        return;
      }
      if (client.socket && typeof client.socket.emit === "function") {
        client.socket.emit("input", String(command ?? ""));
      }
    }
  };
};

const createNativeSocketShim = ({ win }) => ({
  emit(event, payload, ack) {
    if (event === "input" && win.DomeNative && typeof win.DomeNative.sendInput === "function") {
      win.DomeNative.sendInput(String(payload ?? ""));
      if (typeof ack === "function") {
        ack({ status: "command sent" });
      }
    } else if (typeof ack === "function") {
      ack({ status: "ok" });
    }
  },
  on() {},
  off() {},
  disconnect() {
    if (win.DomeNative && typeof win.DomeNative.disconnectNative === "function") {
      win.DomeNative.disconnectNative();
    }
  },
  connect() {
    if (win.DomeNative && typeof win.DomeNative.connectNative === "function") {
      win.DomeNative.connectNative();
    }
  }
});

export const notifyNativeBridgeReady = ({ win = globalThis.window }) => {
  if (win.DomeNative && typeof win.DomeNative.bridgeReady === "function") {
    try {
      win.DomeNative.bridgeReady();
    } catch (err) {
      // Ignore bridge ready handshake failures.
    }
  }

  if (typeof win.DomeNativeFlushQueuedEvents === "function") {
    try {
      win.DomeNativeFlushQueuedEvents();
    } catch (err) {
      // Ignore queue flush failures so the client can continue initializing.
    }
  }
};

export const startClientSocket = ({
  client,
  doc = globalThis.document,
  win = globalThis.window,
  features,
  hasNativeBridge = false
}) => {
  if (hasNativeBridge) {
    const nativeSocketShim = createNativeSocketShim({ win });
    client.socket = nativeSocketShim;
    client.socketState = SOCKET_STATE_ENUM.CONNECTED;
    return nativeSocketShim;
  }

  win.setTimeout(function() {
    client.socket = features.setupSocket({ client, doc, win });
    client.socket.on("data", client.parseSocketData);
  }, 500);
  return null;
};
