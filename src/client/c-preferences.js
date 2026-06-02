import { dome, logger } from "./b-variables.js";
import {
  store,
  clientOptions
} from "./pages/client-options.js";
import {
  FONT_CHOICES,
  normalizeHexColor
} from "./client-option-schema.js";
import {
  CLIENT_OPTION_NAME_ERROR,
  CLIENT_OPTION_VALUE_ERROR,
  buildClientOptionsHelp,
  getClientOptionDefinition,
  parseClientOptionCommandIntent,
  readClientPreferences,
  validateClientOptionValue
} from "./client-option-parser.js";

const shortenFeatureEnabled = typeof window === "undefined" ? true : window.shortenEnabled !== false;

dome.readPreferences = function() {
  const { preferences, persistenceUpdates } = readClientPreferences({
    locationSearch: window.location.search || "",
    getStoredValue: (key) => store.get(key),
    storagePrefix: clientOptions.prefix,
    shortenFeatureEnabled
  });
  persistenceUpdates.forEach(({ key, value }) => {
    store.put(key, value);
  });

  return preferences;
};

const CLIENT_OPTIONS_HELP = buildClientOptionsHelp();

const showClientOptionHelp = function() {
  dome.buffer.append(CLIENT_OPTIONS_HELP);
};
const showClientOption = function(optionName) {
  let opts = Object.keys(dome.preferences);
  if (optionName) {
    if (!Object.prototype.hasOwnProperty.call(dome.preferences, optionName)) {
      return dome.buffer.append(CLIENT_OPTION_NAME_ERROR);
    }
    opts = [optionName];
  }

  opts.forEach(opt => {
    dome.buffer.append("  " + opt + " : " + dome.preferences[opt] + "\n");
  });
};

const applyTransparentOverlayPreference = function(transparentOverlay = dome.preferences?.transparentOverlay) {
  document.querySelectorAll(".ui-autocomplete").forEach((ac) => {
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
    const overlay = document.querySelector(selector);
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

dome.applyTransparentOverlayPreference = applyTransparentOverlayPreference;

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

const applyInputReaderTextPreferences = function() {
  if (!dome.inputReader) return;
  const prefFont = dome.preferences?.inputFont;
  const fontName = FONT_CHOICES.includes(prefFont) ? prefFont : "standard";
  const prefSize = Number(dome.preferences?.inputFontSizePt);
  const fontSizePt = !Number.isNaN(prefSize) && prefSize >= 8 && prefSize <= 24 ? prefSize : 11;
  dome.inputReader.classList.remove(...INPUT_FONT_CLASSES);
  dome.inputReader.classList.add(`${fontName}Text`);
  dome.inputReader.style.fontFamily = INPUT_FONT_FAMILIES[fontName] || INPUT_FONT_FAMILIES.standard;
  dome.inputReader.style.fontSize = `${fontSizePt}pt`;
};

dome.applyInputReaderTextPreferences = applyInputReaderTextPreferences;

const applyOutputBufferTextPreferences = function() {
  if (!dome.buffer) return;
  const prefSize = Number(dome.preferences?.lineBufferFontSizePt);
  const fontSizePt = !Number.isNaN(prefSize) && prefSize >= 8 && prefSize <= 24 ? prefSize : 9.75;
  dome.buffer.style.fontSize = `${fontSizePt}pt`;
};

dome.applyOutputBufferTextPreferences = applyOutputBufferTextPreferences;

const applyInputReaderColorPreferences = function() {
  if (!dome.inputReader) return;
  const fg = normalizeHexColor(dome.preferences?.inputFontColor) || "#EEEEEE";
  const bg = normalizeHexColor(dome.preferences?.inputBackgroundColor) || "#333333";
  dome.inputReader.style.setProperty("--inputCustomFG", fg);
  dome.inputReader.style.setProperty("--inputCustomBG", bg);
  dome.inputReader.style.color = fg;
  dome.inputReader.style.backgroundColor = bg;
};

dome.applyInputReaderColorPreferences = applyInputReaderColorPreferences;

const setupCommandSuggestions = function() {
  if (!dome.autoComplete || !dome.inputReader) return;
  dome.autoComplete();
  const acSetup = dome.setupAutoComplete(dome.inputReader, dome.userType);
  if (acSetup && typeof acSetup.then === "function") {
    acSetup.then(() => applyTransparentOverlayPreference());
  } else {
    applyTransparentOverlayPreference();
  }
};

const setClientOption = function(optionName, optionValue) {
  if (optionName === "shortenUrls" && !shortenFeatureEnabled) {
    clientOptions.save("shorten", false);
    dome.preferences.shortenUrls = false;
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(dome.preferences, optionName)) {
    return dome.buffer?.append(CLIENT_OPTION_NAME_ERROR);
  }

  const validation = validateClientOptionValue(optionName, optionValue);
  if (!validation.valid) {
    return dome.buffer?.append(validation.error || CLIENT_OPTION_VALUE_ERROR + "\n");
  }
  const optionDef = validation.optionDef || getClientOptionDefinition(optionName);
  optionValue = validation.value;

  clientOptions.save( optionDef.key, optionValue );

  if (dome.preferences[ optionName ] != optionValue) {
    dome.buffer?.append("changing @client-option " + optionName + " to " + optionValue + "\n");
    if (optionName === "colorSet") {
      dome.buffer?.classList.remove("colorset-" + dome.preferences.colorSet);
      dome.inputReader?.classList.remove("colorset-" + dome.preferences.colorSet);
    }
    if (optionName === "lineBufferFont") dome.buffer?.classList.remove(dome.preferences.lineBufferFont + "Text");
    dome.preferences[optionName] = optionValue;
    if (optionName === "playDing") {
      dome.alert.active = optionValue && !document.hasFocus();
    }
    if (optionName === "lineBufferFont") {
      dome.buffer?.classList.add(dome.preferences.lineBufferFont + "Text");
    }
    if (optionName === "lineBufferFontSizePt") {
      applyOutputBufferTextPreferences();
    }
    if (optionName === "inputFont" || optionName === "inputFontSizePt") {
      applyInputReaderTextPreferences();
    }
    if (optionName === "inputFontColor" || optionName === "inputBackgroundColor") {
      applyInputReaderColorPreferences();
    }
    if (optionName === "editorFont") {
      Object.values(dome.spawned || {}).forEach((w) => {
        w.postMessage({ type: "set-editor-font", font: optionValue }, "*");
      });
      dome.ideWindow?.postMessage({ type: "ide-set-font", font: optionValue }, "*");
    }
    if (optionName === "colorSet" && dome.preferences.colorSet != "normal") {
      dome.buffer?.classList.add("colorset-" + dome.preferences.colorSet);
      dome.inputReader?.classList.add("colorset-" + dome.preferences.colorSet);
    }
    if (optionName === "transparentOverlay") {
      applyTransparentOverlayPreference(optionValue);
    }
    if ( optionName === "broadSearch" && dome.preferences.commandSuggestions) {
      if (dome.inputReader) dome.inputReader.commandSuggestions( "destroy" );
      setupCommandSuggestions();
    }
    if ( optionName === "commandSuggestions") {
      if (dome.preferences.commandSuggestions) {
        setupCommandSuggestions();
      } else {
        if (dome.inputReader) dome.inputReader.commandSuggestions( "destroy" );
      }
    }
    if (optionName === "autoScroll" || optionName === "scrollUpToPause") {
      dome.setupAutoscroll?.();
    }
    if (optionName === "shortenUrls" && optionValue === true) {
      if (dome.socket) dome.socket.emit("shorten-on", "shorten-on");
    }
  }
};

dome.setClientOption = setClientOption;

dome.parseClientOptionCommand = function( command ) {
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
  if (dome.scrollBuffer) dome.scrollBuffer();
};
