import { dome, SOCKET_STATE_ENUM, setSocket } from "./b-variables.js";
import { setupChevronToggle } from "./chevron-toggle.js";
import { setupButtons } from "./u-buttons.js";

export const createClientFeatureSet = () => ({
  setupButtons,
  setupChevronToggle
});

export const createClientSetupHooks = (client = dome) => ({
  setupInputReader: () => client.setupInputReader?.(),
  setupAutoComplete: (inputReader, userType) => client.setupAutoComplete?.(inputReader, userType),
  setupWindowHandlers: () => client.setupWindowHandlers?.(),
  setupEditorSupport: () => client.setupEditorSupport?.(),
  setupAutoscroll: () => client.setupAutoscroll?.(),
  setupButtons: () => client.setupButtons?.(),
  setupChevronToggle: () => client.setupChevronToggle?.(),
  setupHealthCheck: () => client.setupHealthCheck?.(),
  setupOutputParser: () => client.setupOutputParser?.(),
  setupSocket: () => client.setupSocket()
});

export const assignClientDomReferences = ({ client = dome, doc = globalThis.document }) => {
  Object.assign(client, {
    userType        : "p",
    socket          : null,
    socketState     : SOCKET_STATE_ENUM.BEFORE_FIRST,
    titleBarText    : null,
    gameHealth      : [],
    client          : doc.querySelector("#browser-client"),
    buffer          : doc.querySelector("#lineBuffer"),
    healthDisplay   : doc.querySelector("#gameHealth"),
    healthDetail    : doc.querySelector("#gameHealthDetail"),
    statusDisplay   : doc.querySelector("#statusMsg"),
    editorListView  : doc.querySelector("#editor-list-view"),
    inputReader     : doc.querySelector("#inputBuffer"),
    reconnectButton : doc.querySelector("#button-reconnect"),
    saveButton      : doc.querySelectorAll("#button-save, #button-save-mini"),
    scrollButton    : doc.querySelector("#button-auto-scroll"),
    clearButton     : doc.querySelector("#button-clear-buffer"),
    clearBufferOverlay: doc.querySelector("#clear-buffer-overlay"),
    clearBufferConfirmButton: doc.querySelector("#button-clear-buffer-confirm"),
    clearBufferCancelButton: doc.querySelector("#button-clear-buffer-cancel"),
    shortcutsButton : doc.querySelector("#button-shortcuts"),
    shortcutsOverlay: doc.querySelector("#shortcuts-overlay"),
    clientOptionsButton: doc.querySelector("#button-client-options"),
    clientOptionsOverlay: doc.querySelector("#client-options-overlay"),
    clientOptionsClose: doc.querySelector("#button-client-options-close"),
    perfBufferFlag  : doc.querySelector("#perf-buffer-flag"),
    disconnectView  : {
      overlay     : doc.querySelector("#disconnect-overlay"),
      buttonGroup : doc.querySelector(".disconnect-buttons")
    },
    spawned         : {},
    makeEditor : null,
    refreshRecent : function(e) {e.preventDefault();}
  });
};

const applyTransparentOverlayPreference = ({ client, doc }) => {
  if (client.applyTransparentOverlayPreference) {
    client.applyTransparentOverlayPreference();
    return;
  }
  doc.querySelectorAll(".ui-autocomplete").forEach((ac) => {
    if (client.preferences.transparentOverlay) {
      ac.classList.add("ui-transparent-overlay");
      ac.classList.remove("ui-opaque-overlay");
    } else {
      ac.classList.add("ui-opaque-overlay");
      ac.classList.remove("ui-transparent-overlay");
    }
  });
};

export const applyInitialClientPreferences = ({ client = dome, doc = globalThis.document, hooks = createClientSetupHooks(client) }) => {
  const preferences = client.readPreferences();
  client.preferences = preferences;

  if (preferences.lineBufferFont !== "standard") {
    client.buffer.classList.remove("standardText");
    client.buffer.classList.add(`${preferences.lineBufferFont}Text`);
  }
  if (preferences.colorSet !== "normal") {
    client.buffer.classList.add(`colorset-${preferences.colorSet}`);
    client.inputReader?.classList.add(`colorset-${preferences.colorSet}`);
  }
  client.applyOutputBufferTextPreferences?.();
  client.applyInputReaderTextPreferences?.();
  client.applyInputReaderColorPreferences?.();

  if (client.inputReader) {
    hooks.setupInputReader();
    if (preferences.commandSuggestions && client.autoComplete != null) {
      client.autoComplete();
      const acSetup = hooks.setupAutoComplete(client.inputReader, client.userType);
      if (acSetup && typeof acSetup.then === "function") {
        acSetup.then(() => applyTransparentOverlayPreference({ client, doc }));
      } else {
        applyTransparentOverlayPreference({ client, doc });
      }
      return;
    }
  }
  applyTransparentOverlayPreference({ client, doc });
};

export const setupClientFeatures = ({
  client = dome,
  doc = globalThis.document,
  win = globalThis.window,
  hooks = createClientSetupHooks(client),
  features = createClientFeatureSet()
} = {}) => {
  hooks.setupWindowHandlers();
  hooks.setupEditorSupport();
  hooks.setupAutoscroll();
  features.setupButtons({ client, doc, win });
  features.setupChevronToggle({ client, doc, win });
  hooks.setupHealthCheck();
  hooks.setupOutputParser();
};

export const installDomeBridge = ({ client = dome, win = globalThis.window, hasNativeBridge = false }) => {
  win.DomeBridge = {
    onData(payload) {
      if (typeof client.parseSocketData === "function") {
        client.parseSocketData(String(payload ?? ""));
      }
    },
    onStatus(payload) {
      if (client.setFadeText && client.statusDisplay) {
        client.setFadeText(client.statusDisplay, String(payload ?? ""));
      }
    },
    onError(payload) {
      if (client.setFadeText && client.statusDisplay) {
        client.setFadeText(client.statusDisplay, "ERROR: " + String(payload ?? ""), true);
      }
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

const notifyNativeBridgeReady = ({ win }) => {
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
  client = dome,
  win = globalThis.window,
  hooks = createClientSetupHooks(client),
  hasNativeBridge = false
}) => {
  if (hasNativeBridge) {
    const nativeSocketShim = createNativeSocketShim({ win });
    setSocket(nativeSocketShim);
    client.socket = nativeSocketShim;
    client.socketState = SOCKET_STATE_ENUM.CONNECTED;
    return nativeSocketShim;
  }

  win.setTimeout(function() {
    client.socket = hooks.setupSocket();
    client.socket.on("data", client.parseSocketData);
  }, 500);
  return null;
};

export const initClient = ({
  client = dome,
  win = globalThis.window,
  doc = globalThis.document,
  hooks = createClientSetupHooks(client),
  features = createClientFeatureSet()
} = {}) => {
  const hasNativeBridge = !!win.DomeNative && typeof win.DomeNative.sendInput === "function";

  assignClientDomReferences({ client, doc });
  applyInitialClientPreferences({ client, doc, hooks });
  setupClientFeatures({ client, doc, win, hooks, features });
  installDomeBridge({ client, win, hasNativeBridge });
  notifyNativeBridgeReady({ win });
  startClientSocket({ client, win, hooks, hasNativeBridge });

  return client;
};

export const startClientWhenDomReady = ({
  client = dome,
  win = globalThis.window,
  doc = globalThis.document,
  hooks = createClientSetupHooks(client),
  features = createClientFeatureSet()
} = {}) => {
  const start = () => initClient({ client, win, doc, hooks, features });
  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", start);
    return;
  }
  start();
};

if (globalThis.window && globalThis.document) {
  startClientWhenDomReady();
}
