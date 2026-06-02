import { dome, logger } from "./b-variables.js";
import {
  store,
  clientOptions
} from "./pages/client-options.js";
import {
  CLIENT_OPTION_BY_PARAM,
  CLIENT_OPTION_BY_PREFERENCE,
  CLIENT_OPTION_DEFINITIONS,
  FONT_CHOICES,
  buildPreferenceDefaults,
  coerceOptionValue,
  normalizeHexColor
} from "./client-option-schema.js";

const shortenFeatureEnabled = typeof window === "undefined" ? true : window.shortenEnabled !== false;

dome.readPreferences = function() {
  const options = window.location.search || "";

  const preferences = buildPreferenceDefaults();
  // load saved preferences from localStorage
  CLIENT_OPTION_DEFINITIONS.forEach((pref) => {
    const key = clientOptions.prefix + pref.key;
    const saved = store.get(key);
    if (saved !== null) {
      preferences[pref.preferenceName] = saved;
    }
  });
  if (options) {
    const searchParams = new URLSearchParams(options);
    CLIENT_OPTION_DEFINITIONS.forEach((option) => {
      if (!searchParams.has(option.param)) return;
      const rawValue = searchParams.get(option.param);
      const coerced = coerceOptionValue(option, rawValue);
      if (coerced.valid && !(option.key === "buffer" && coerced.value <= 0)) {
        preferences[option.preferenceName] = coerced.value;
      }
    });
  }
  if (store.get(clientOptions.prefix + "editorfont") === null && !(options && options.indexOf("ef=") !== -1)) {
    preferences.editorFont = preferences.lineBufferFont;
    store.put(clientOptions.prefix + "editorfont", preferences.editorFont);
  }
  if (!shortenFeatureEnabled) {
    preferences.shortenUrls = false;
    store.put(clientOptions.prefix + "shorten", false);
  }

  return preferences;
};

const PREFERENCE_ENUM = { ...CLIENT_OPTION_BY_PARAM, ...CLIENT_OPTION_BY_PREFERENCE };

const helpDocs = [
  "Help on @client-option:\n",
  "  @client-options\n",
  "  @client-option &lt;option name&gt; [&lt;new value&gt;]\n",
  "\n",
  "  Options Include:\n"
];

CLIENT_OPTION_DEFINITIONS.forEach((option) => {
  helpDocs[helpDocs.length] = "   [" + option.param + "] " + option.preferenceName + "\n";
});

const CLIENT_OPTION_NAME_ERROR = "Unknown @client-option specified, check @client-options" + "\n";
const CLIENT_OPTION_VALUE_ERROR = "Invalid @client-option value, must be one of ";
const CLIENT_OPTIONS_HELP = helpDocs;

const showClientOptionHelp = function() {
  dome.buffer.append(CLIENT_OPTIONS_HELP);
};
const translateClientOptionName = function(optionName) {
  if (PREFERENCE_ENUM[ optionName ] != null) {
    return PREFERENCE_ENUM[ optionName ].preferenceName;
  }
  return optionName;
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

  if (optionValue === "true") {
    optionValue = true;
  } else if (optionValue === "false") {
    optionValue = false;
  }
  const optionDef = PREFERENCE_ENUM[ optionName ];
  const coerced = coerceOptionValue(optionDef, optionValue);
  optionValue = coerced.value;

  if (optionName === "lineBufferFontSizePt" || optionName === "inputFontSizePt") {
    if (typeof optionValue !== "number" || Number.isNaN(optionValue)) {
      return dome.buffer?.append("Invalid @client-option value, must be a number between 8 and 24\n");
    }
    if (optionValue < 8 || optionValue > 24) {
      return dome.buffer?.append("Invalid @client-option value, must be between 8 and 24\n");
    }
  }

  if (optionName === "inputFontColor" || optionName === "inputBackgroundColor") {
    if (!coerced.valid) {
      return dome.buffer?.append("Invalid @client-option value, must be a hex color like #AABBCC\n");
    }
  }

  const validValues = optionDef.ok || (typeof optionDef.def === "boolean" ? [true, false] : null);
  if (!coerced.valid && validValues) {
    return dome.buffer?.append(CLIENT_OPTION_VALUE_ERROR + validValues.toString() + "\n");
  }

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
  if (command === "@client-options") {
    showClientOption();
  } else {
    const commandParts = command.split(" ");
    if (commandParts.length < 2) {
      showClientOptionHelp();
    } else {
      const optionName = translateClientOptionName(commandParts[1]);

      if (commandParts.length < 3) {
        // read
        showClientOption(optionName);
      } else {
        // write
        setClientOption( optionName, commandParts[ 2 ]);
      }
    }
  }
  if (dome.scrollBuffer) dome.scrollBuffer();
};
