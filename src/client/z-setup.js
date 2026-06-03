import { createClientState } from "./client-state.js";
import { createClientCapabilities } from "./client-capabilities.js";
import { setupChevronToggle } from "./chevron-toggle.js";
import { setupInputReader } from "./d-inputreader.js";
import { setupWindowHandlers } from "./e-window.js";
import { setupOutputParser } from "./f-buffer.js";
import { setupSocket } from "./g-socket-lifecycle.js";
import { setupClientPreferences } from "./c-preferences.js";
import { setupEditorSupport } from "./s-editor.js";
import { setupAutoscroll } from "./t-autoscroll.js";
import { setupButtons } from "./u-buttons.js";
import { setupIdeLauncher } from "./ide.js";
import { setupAutoCompleteFeature } from "./w-autocomplete.js";
import { setupHealthCheck } from "./y-health.js";
import {
  installDomeBridge,
  notifyNativeBridgeReady,
  startClientSocket
} from "./native-bridge.js";

export {
  installDomeBridge,
  notifyNativeBridgeReady,
  startClientSocket
} from "./native-bridge.js";

export const createClientFeatureSet = () => ({
  setupAutoCompleteFeature,
  setupAutoscroll,
  setupButtons,
  setupChevronToggle,
  setupEditorSupport,
  setupIdeLauncher,
  setupClientPreferences,
  setupHealthCheck,
  setupInputReader,
  setupOutputParser,
  setupSocket,
  setupWindowHandlers
});

export const assignClientDomReferences = ({ client, doc = globalThis.document }) => {
  Object.assign(client, {
    ...createClientState(),
    ...client,
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
    }
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

export const applyInitialClientPreferences = ({
  client,
  doc = globalThis.document,
  features = createClientFeatureSet(),
  capabilities = createClientCapabilities({ client, doc })
}) => {
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
    features.setupInputReader({ client, doc, capabilities: capabilities.autocomplete });
    if (preferences.commandSuggestions && typeof client.setupAutoComplete === "function") {
      const acSetup = client.setupAutoComplete?.(client.inputReader, client.userType);
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
  client,
  doc = globalThis.document,
  win = globalThis.window,
  features = createClientFeatureSet(),
  capabilities = createClientCapabilities({ client, doc, win })
} = {}) => {
  features.setupWindowHandlers({ client, doc, win, capabilities: capabilities.uiControls });
  features.setupIdeLauncher?.({ client, win, getSocket: capabilities.editor.getSocket, capabilities: capabilities.editor });
  features.setupEditorSupport({ client, doc, win, capabilities: capabilities.editor });
  features.setupAutoscroll({ client, doc, win, capabilities: capabilities.uiControls });
  features.setupButtons({ client, doc, win, capabilities: capabilities.uiControls });
  features.setupChevronToggle({ client, doc, win, capabilities: capabilities.uiControls });
  features.setupHealthCheck({ client, doc, win, capabilities: capabilities.health });
  features.setupOutputParser({ client, doc, win, capabilities: capabilities.socketOutput });
};

export const initClient = ({
  client = createClientState(),
  win = globalThis.window,
  doc = globalThis.document,
  features = createClientFeatureSet()
} = {}) => {
  const hasNativeBridge = !!win.DomeNative && typeof win.DomeNative.sendInput === "function";

  assignClientDomReferences({ client, doc });
  const capabilities = createClientCapabilities({ client, doc, win });
  features.setupClientPreferences?.({ client, doc, win, capabilities: capabilities.preferences });
  features.setupAutoCompleteFeature({ client, doc, win, capabilities: capabilities.autocomplete });
  applyInitialClientPreferences({ client, doc, features, capabilities });
  setupClientFeatures({ client, doc, win, features, capabilities });
  installDomeBridge({ client, win, hasNativeBridge });
  notifyNativeBridgeReady({ win });
  startClientSocket({ client, doc, win, features, hasNativeBridge });

  return client;
};

export const startClientWhenDomReady = ({
  client = createClientState(),
  win = globalThis.window,
  doc = globalThis.document,
  features = createClientFeatureSet()
} = {}) => {
  const start = () => initClient({ client, win, doc, features });
  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", start);
    return;
  }
  start();
};

if (globalThis.window && globalThis.document) {
  startClientWhenDomReady();
}
