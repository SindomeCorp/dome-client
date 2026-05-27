import { dome, SOCKET_STATE_ENUM, setSocket } from "./b-variables.js";

const init = () => {
  const hasNativeBridge = typeof window !== "undefined" && !!window.DomeNative && typeof window.DomeNative.sendInput === "function";

  // references to various objects
  Object.assign(dome, {
    userType        : "p",
    socket          : null,
    socketState     : SOCKET_STATE_ENUM.BEFORE_FIRST,
    titleBarText    : null,
    gameHealth      : [],
    client          : document.querySelector("#browser-client"),
    buffer          : document.querySelector("#lineBuffer"),
    healthDisplay   : document.querySelector("#gameHealth"),
    healthDetail    : document.querySelector("#gameHealthDetail"),
    statusDisplay   : document.querySelector("#statusMsg"),
    editorListView  : document.querySelector("#editor-list-view"),
    inputReader     : document.querySelector("#inputBuffer"),
    reconnectButton : document.querySelector("#button-reconnect"),
    saveButton      : document.querySelectorAll("#button-save, #button-save-mini"),
    scrollButton    : document.querySelector("#button-auto-scroll"),
    clearButton     : document.querySelector("#button-clear-buffer"),
    clearBufferOverlay: document.querySelector("#clear-buffer-overlay"),
    clearBufferConfirmButton: document.querySelector("#button-clear-buffer-confirm"),
    clearBufferCancelButton: document.querySelector("#button-clear-buffer-cancel"),
    shortcutsButton : document.querySelector("#button-shortcuts"),
    shortcutsOverlay: document.querySelector("#shortcuts-overlay"),
    clientOptionsButton: document.querySelector("#button-client-options"),
    clientOptionsOverlay: document.querySelector("#client-options-overlay"),
    clientOptionsClose: document.querySelector("#button-client-options-close"),
    perfBufferFlag  : document.querySelector("#perf-buffer-flag"),
    disconnectView  : {
      overlay     : document.querySelector("#disconnect-overlay"),
      buttonGroup : document.querySelector(".disconnect-buttons")
    },
    spawned         : {},
    makeEditor : null,
    refreshRecent : function(e) {e.preventDefault();}
  });

  const preferences = dome.readPreferences();
  dome.preferences = preferences;
  const setOverlayClass = () => {
    if (dome.applyTransparentOverlayPreference) {
      dome.applyTransparentOverlayPreference();
      return;
    }
    document.querySelectorAll(".ui-autocomplete").forEach((ac) => {
      if (dome.preferences.transparentOverlay) {
        ac.classList.add("ui-transparent-overlay");
        ac.classList.remove("ui-opaque-overlay");
      } else {
        ac.classList.add("ui-opaque-overlay");
        ac.classList.remove("ui-transparent-overlay");
      }
    });
  };
  if (preferences.lineBufferFont !== "standard") {
    dome.buffer.classList.remove("standardText");
    dome.buffer.classList.add(`${preferences.lineBufferFont}Text`);
  }
  if (preferences.colorSet !== "normal") {
    dome.buffer.classList.add(`colorset-${preferences.colorSet}`);
    dome.inputReader?.classList.add(`colorset-${preferences.colorSet}`);
  }
  dome.applyOutputBufferTextPreferences?.();
  dome.applyInputReaderTextPreferences?.();
  dome.applyInputReaderColorPreferences?.();
  if (dome.inputReader) {
    if (dome.setupInputReader) dome.setupInputReader();
    if (preferences.commandSuggestions && dome.autoComplete != null) {
      dome.autoComplete();
      const acSetup = dome.setupAutoComplete(dome.inputReader, dome.userType);
      if (acSetup && typeof acSetup.then === "function") {
        acSetup.then(() => setOverlayClass());
      } else {
        setOverlayClass();
      }
    } else {
      setOverlayClass();
    }
  } else {
    setOverlayClass();
  }
  if (dome.setupWindowHandlers) dome.setupWindowHandlers();
  if (dome.setupEditorSupport) dome.setupEditorSupport();
  if (dome.setupAutoscroll) dome.setupAutoscroll();
  if (dome.setupButtons) dome.setupButtons();
  if (dome.setupChevronToggle) dome.setupChevronToggle();
  if (dome.setupHealthCheck) dome.setupHealthCheck();

  dome.setupOutputParser();

  window.DomeBridge = {
    onData(payload) {
      if (typeof dome.parseSocketData === "function") {
        dome.parseSocketData(String(payload ?? ""));
      }
    },
    onStatus(payload) {
      if (dome.setFadeText && dome.statusDisplay) {
        dome.setFadeText(dome.statusDisplay, String(payload ?? ""));
      }
    },
    onError(payload) {
      if (dome.setFadeText && dome.statusDisplay) {
        dome.setFadeText(dome.statusDisplay, "ERROR: " + String(payload ?? ""), true);
      }
    },
    sendInput(command) {
      if (hasNativeBridge && window.DomeNative && typeof window.DomeNative.sendInput === "function") {
        window.DomeNative.sendInput(String(command ?? ""));
        return;
      }
      if (dome.socket && typeof dome.socket.emit === "function") {
        dome.socket.emit("input", String(command ?? ""));
      }
    }
  };

  if (hasNativeBridge && window.DomeNative && typeof window.DomeNative.bridgeReady === "function") {
    try {
      window.DomeNative.bridgeReady();
    } catch (err) {
      // Ignore bridge ready handshake failures.
    }
  }

  if (typeof window.DomeNativeFlushQueuedEvents === "function") {
    try {
      window.DomeNativeFlushQueuedEvents();
    } catch (err) {
      // Ignore queue flush failures so the client can continue initializing.
    }
  }

  if (hasNativeBridge) {
    const nativeSocketShim = {
      emit(event, payload, ack) {
        if (event === "input" && window.DomeNative && typeof window.DomeNative.sendInput === "function") {
          window.DomeNative.sendInput(String(payload ?? ""));
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
        if (window.DomeNative && typeof window.DomeNative.disconnectNative === "function") {
          window.DomeNative.disconnectNative();
        }
      },
      connect() {
        if (window.DomeNative && typeof window.DomeNative.connectNative === "function") {
          window.DomeNative.connectNative();
        }
      }
    };
    setSocket(nativeSocketShim);
    dome.socket = nativeSocketShim;
    dome.socketState = SOCKET_STATE_ENUM.CONNECTED;
  } else {
    setTimeout(function() {
      dome.socket = dome.setupSocket();
      dome.socket.on("data", dome.parseSocketData);
    }, 500);
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
