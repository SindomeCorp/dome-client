export function createClientOptionEffects({
  client,
  doc,
  win,
  setupAutoscroll,
  setupAutoCompleteFeature,
  applyOutputBufferTextPreferences,
  applyInputReaderTextPreferences,
  applyInputReaderColorPreferences,
  applyTransparentOverlayPreference
}) {
  const setupCommandSuggestions = function() {
    if (!client.inputReader) return;
    setupAutoCompleteFeature({ client, doc, win });
    const acSetup = client.setupAutoComplete?.(client.inputReader, client.userType);
    if (acSetup && typeof acSetup.then === "function") {
      acSetup.then(() => applyTransparentOverlayPreference());
    } else {
      applyTransparentOverlayPreference();
    }
  };

  const handlers = {
    lineBufferFont(value, previousValue) {
      client.buffer?.classList.remove(previousValue + "Text");
      client.buffer?.classList.add(client.preferences.lineBufferFont + "Text");
    },
    lineBufferFontSizePt() {
      applyOutputBufferTextPreferences();
    },
    inputFont() {
      applyInputReaderTextPreferences();
    },
    inputFontSizePt() {
      applyInputReaderTextPreferences();
    },
    inputFontColor() {
      applyInputReaderColorPreferences();
    },
    inputBackgroundColor() {
      applyInputReaderColorPreferences();
    },
    editorFont(value) {
      Object.values(client.spawned || {}).forEach((w) => {
        w.postMessage({ type: "set-editor-font", font: value }, "*");
      });
      client.ideWindow?.postMessage({ type: "ide-set-font", font: value }, "*");
    },
    colorSet(value, previousValue) {
      client.buffer?.classList.remove("colorset-" + previousValue);
      client.inputReader?.classList.remove("colorset-" + previousValue);
      if (client.preferences.colorSet != "normal") {
        client.buffer?.classList.add("colorset-" + client.preferences.colorSet);
        client.inputReader?.classList.add("colorset-" + client.preferences.colorSet);
      }
    },
    transparentOverlay(value) {
      applyTransparentOverlayPreference(value);
    },
    broadSearch() {
      if (!client.preferences.commandSuggestions) return;
      client.inputReader?.commandSuggestions("destroy");
      setupCommandSuggestions();
    },
    commandSuggestions() {
      if (client.preferences.commandSuggestions) {
        setupCommandSuggestions();
      } else {
        client.inputReader?.commandSuggestions("destroy");
      }
    },
    autoScroll() {
      setupAutoscroll({ client, doc, win });
    },
    scrollUpToPause() {
      setupAutoscroll({ client, doc, win });
    },
    shortenUrls(value) {
      if (value === true) {
        client.socket?.emit("shorten-on", "shorten-on");
      }
    },
    playDing(value) {
      client.alert.active = value && !doc.hasFocus();
    }
  };

  return {
    apply(optionName, value, previousValue) {
      handlers[optionName]?.(value, previousValue);
    },
    setupCommandSuggestions
  };
}
