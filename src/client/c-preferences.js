import { logger } from "./b-variables.js";
import {
  store,
  clientOptions,
  setClientOptionsActions
} from "./pages/client-options.js";
import {
  FONT_CHOICES,
  normalizeHexColor
} from "./client-option-schema.js";
import { createClientOptionEffects } from "./client-option-effects.js";
import {
  CLIENT_OPTION_NAME_ERROR,
  CLIENT_OPTION_VALUE_ERROR,
  buildClientOptionsHelp,
  getClientOptionDefinition,
  parseClientOptionCommandIntent,
  readClientPreferences,
  validateClientOptionValue
} from "./client-option-parser.js";
import { setupAutoscroll } from "./t-autoscroll.js";
import { setupAutoCompleteFeature } from "./w-autocomplete.js";

const CLIENT_OPTIONS_HELP = buildClientOptionsHelp();

const INPUT_FONT_FAMILIES = {
  standard: "\"Source Code Pro\"",
  lucida: "\"Lucida Console\"",
  courier: "\"Courier New\"",
  roboto: "\"Roboto Mono\"",
  "comic-mono": "\"Comic Mono\"",
  monaco: "\"Monaco\"",
  menlo: "\"Menlo\"",
  "ubuntu-mono": "\"Ubuntu Mono\"",
  consolas: "\"Consolas\"",
};
const INPUT_FONT_CLASSES = FONT_CHOICES.map((font) => `${font}Text`);

export function createClientOptionsActions({ client, doc, win, setupAutoscrollFn = setupAutoscroll }) {
  return {
    setClientOption: (name, value) => client.setClientOption?.(name, value),
    parseClientOptionCommand: (command) => client.parseClientOptionCommand?.(command),
    appendOutput: (text) => client.buffer?.append(text),
    scrollBuffer: () => client.scrollBuffer?.(),
    refreshAutoscroll: () => setupAutoscrollFn({ client, doc, win }),
    getPreference: (name) => client.preferences?.[name],
    setPreference: (name, value) => {
      if (client.preferences) {
        client.preferences[name] = value;
      }
    }
  };
}

export function setupClientPreferences({
  client,
  doc = globalThis.document,
  win = globalThis.window,
  storage = store,
  options = clientOptions,
  setupAutoscrollFn = setupAutoscroll,
  setupAutoCompleteFeatureFn = setupAutoCompleteFeature
} = {}) {
  const shortenFeatureEnabled = typeof win === "undefined" ? true : win.shortenEnabled !== false;

  client.readPreferences = function() {
    const { preferences, persistenceUpdates } = readClientPreferences({
      locationSearch: win.location.search || "",
      getStoredValue: (key) => storage.get(key),
      storagePrefix: options.prefix,
      shortenFeatureEnabled
    });
    persistenceUpdates.forEach(({ key, value }) => {
      storage.put(key, value);
    });

    return preferences;
  };

  const showClientOptionHelp = function() {
    client.buffer.append(CLIENT_OPTIONS_HELP);
  };
  const showClientOption = function(optionName) {
    let opts = Object.keys(client.preferences);
    if (optionName) {
      if (!Object.prototype.hasOwnProperty.call(client.preferences, optionName)) {
        return client.buffer.append(CLIENT_OPTION_NAME_ERROR);
      }
      opts = [optionName];
    }

    opts.forEach(opt => {
      client.buffer.append("  " + opt + " : " + client.preferences[opt] + "\n");
    });
  };

  const applyTransparentOverlayPreference = function(transparentOverlay = client.preferences?.transparentOverlay) {
    doc.querySelectorAll(".ui-autocomplete").forEach((ac) => {
      if (transparentOverlay) {
        ac.classList.add("ui-transparent-overlay");
        ac.classList.remove("ui-opaque-overlay");
      } else {
        ac.classList.remove("ui-transparent-overlay");
        ac.classList.add("ui-opaque-overlay");
      }
    });

    [
      "#shortcuts-overlay",
      "#history-search-overlay",
      "#client-options-overlay",
      "#gameHealthDetail",
    ].forEach((selector) => {
      const overlay = doc.querySelector(selector);
      if (!overlay) return;
      if (transparentOverlay) {
        overlay.classList.add("ui-transparent-overlay");
        overlay.classList.remove("ui-opaque-overlay");
      } else {
        overlay.classList.remove("ui-transparent-overlay");
        overlay.classList.add("ui-opaque-overlay");
      }
    });
  };

  client.applyTransparentOverlayPreference = applyTransparentOverlayPreference;

  const applyInputReaderTextPreferences = function() {
    if (!client.inputReader) return;
    const prefFont = client.preferences?.inputFont;
    const fontName = FONT_CHOICES.includes(prefFont) ? prefFont : "standard";
    const prefSize = Number(client.preferences?.inputFontSizePt);
    const fontSizePt = !Number.isNaN(prefSize) && prefSize >= 8 && prefSize <= 24 ? prefSize : 11;
    client.inputReader.classList.remove(...INPUT_FONT_CLASSES);
    client.inputReader.classList.add(`${fontName}Text`);
    client.inputReader.style.fontFamily = INPUT_FONT_FAMILIES[fontName] || INPUT_FONT_FAMILIES.standard;
    client.inputReader.style.fontSize = `${fontSizePt}pt`;
  };

  client.applyInputReaderTextPreferences = applyInputReaderTextPreferences;

  const applyOutputBufferTextPreferences = function() {
    if (!client.buffer) return;
    const prefSize = Number(client.preferences?.lineBufferFontSizePt);
    const fontSizePt = !Number.isNaN(prefSize) && prefSize >= 8 && prefSize <= 24 ? prefSize : 9.75;
    client.buffer.style.fontSize = `${fontSizePt}pt`;
  };

  client.applyOutputBufferTextPreferences = applyOutputBufferTextPreferences;

  const applyInputReaderColorPreferences = function() {
    if (!client.inputReader) return;
    const fg = normalizeHexColor(client.preferences?.inputFontColor) || "#EEEEEE";
    const bg = normalizeHexColor(client.preferences?.inputBackgroundColor) || "#333333";
    client.inputReader.style.setProperty("--inputCustomFG", fg);
    client.inputReader.style.setProperty("--inputCustomBG", bg);
    client.inputReader.style.color = fg;
    client.inputReader.style.backgroundColor = bg;
  };

  client.applyInputReaderColorPreferences = applyInputReaderColorPreferences;

  const optionEffects = createClientOptionEffects({
    client,
    doc,
    win,
    setupAutoscroll: setupAutoscrollFn,
    setupAutoCompleteFeature: setupAutoCompleteFeatureFn,
    applyOutputBufferTextPreferences,
    applyInputReaderTextPreferences,
    applyInputReaderColorPreferences,
    applyTransparentOverlayPreference
  });

  const setClientOption = function(optionName, optionValue) {
    if (optionName === "shortenUrls" && !shortenFeatureEnabled) {
      options.save("shorten", false);
      client.preferences.shortenUrls = false;
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(client.preferences, optionName)) {
      return client.buffer?.append(CLIENT_OPTION_NAME_ERROR);
    }

    const validation = validateClientOptionValue(optionName, optionValue);
    if (!validation.valid) {
      return client.buffer?.append(validation.error || CLIENT_OPTION_VALUE_ERROR + "\n");
    }
    const optionDef = validation.optionDef || getClientOptionDefinition(optionName);
    optionValue = validation.value;

    options.save( optionDef.key, optionValue );

    if (client.preferences[ optionName ] != optionValue) {
      const previousValue = client.preferences[optionName];
      client.buffer?.append("changing @client-option " + optionName + " to " + optionValue + "\n");
      client.preferences[optionName] = optionValue;
      optionEffects.apply(optionName, optionValue, previousValue);
    }
  };

  client.setClientOption = setClientOption;

  client.parseClientOptionCommand = function( command ) {
    logger.debug( command );
    const intent = parseClientOptionCommandIntent(command);
    if (intent.type === "list") {
      showClientOption();
    } else if (intent.type === "help") {
      showClientOptionHelp();
    } else if (intent.type === "read") {
      showClientOption(intent.optionName);
    } else if (intent.type === "write") {
      setClientOption(intent.optionName, intent.value);
    } else {
      showClientOptionHelp();
    }
    if (client.scrollBuffer) client.scrollBuffer();
  };

  setClientOptionsActions(createClientOptionsActions({ client, doc, win, setupAutoscrollFn }));
}
