import { dome, logger } from "./b-variables.js";
import {
  store,
  clientOptions,
  EDIT_THEMES,
  FONT_CHOICES,
  COLORSET_CHOICES
} from "./pages/client-options.js";

const shortenFeatureEnabled = typeof window === "undefined" ? true : window.shortenEnabled !== false;

// Preference utilities
dome.weakBrowser = function() {
  if (typeof navigator === "undefined" || typeof navigator.appVersion !== "string") {
    return false;
  }
  const chromeVersion = navigator.appVersion.match(/Chrome\/(\d+)/);
  const badChrome = chromeVersion != null && parseInt(chromeVersion[1], 10) >= 79;
  return badChrome;
};

dome.readPreferences = function() {
  const options = window.location.search || null;

  // user preferences
  const preferences = {
    commandSuggestions : true,
    shortenUrls        : true,
    playDing           : true,
    localEcho          : false,
    colorSet           : "normal",
    autoScroll         : "dbl",
    edittheme          : "twilight",
    editorType         : "ide",
    lineBufferFont     : "standard",
    editorFont         : "standard",
    imagePreview       : false,
    inlineLogCss       : true,
    sdwcNowrapBlocks   : false,
    scrollUpToPause    : false,
    transparentOverlay : true,
    broadSearch        : true,
    performanceBuffer  : dome.weakBrowser() ? 1750 : 0 // set to 0 for unlimited buffer / weak browsers get defaulted to 1750
  };
  // load saved preferences from localStorage
  for (const shortCode in PREFERENCE_ENUM) {
    if (shortCode.length !== 2) continue;
    const pref = PREFERENCE_ENUM[shortCode];
    const key = clientOptions.prefix + pref.storeKey;
    const saved = store.get(key);
    if (saved !== null) {
      preferences[pref.name] = saved;
    }
  }
  if (options) {
    if (options.indexOf("cs=false") != -1) {
      preferences.commandSuggestions = false;
    }

    if (options.indexOf("su=false") != -1) {
      preferences.shortenUrls = false;
    }

    if (options.indexOf("pd=false") != -1) {
      preferences.playDing = false;
    }

    if (options.indexOf("le=true") != -1) {
      preferences.localEcho = true;
    }

    if (options.indexOf("iv=true") != -1) {
      preferences.imagePreview = true;
    }
    if (options.indexOf("lc=false") != -1) {
      preferences.inlineLogCss = false;
    }
    if (options.indexOf("nw=true") != -1) {
      preferences.sdwcNowrapBlocks = true;
    }
    if (options.indexOf("up=true") != -1) {
      preferences.scrollUpToPause = true;
    }

    if (options.indexOf("as=long") != -1) {
      preferences.autoScroll = "long";
    } else if (options.indexOf("as=none") != -1) {
      preferences.autoScroll = "none";
    }

    const ofIndex = options.indexOf("of=");
    if (ofIndex !== -1) {
      let rest = options.substr(ofIndex);
      const nIndex = rest.indexOf("&");
      const of = nIndex !== -1 ? rest.substr(0, nIndex) : rest;
      if (of.length > 3) {
        const font = of.substr(3);
        if (FONT_CHOICES.includes(font)) {
          preferences.lineBufferFont = font;
        }
      }
    }

    const efIndex = options.indexOf("ef=");
    if (efIndex !== -1) {
      let rest = options.substr(efIndex);
      const nIndex = rest.indexOf("&");
      const ef = nIndex !== -1 ? rest.substr(0, nIndex) : rest;
      if (ef.length > 3) {
        const font = ef.substr(3);
        if (FONT_CHOICES.includes(font)) {
          preferences.editorFont = font;
        }
      }
    }

    const etIndex = options.indexOf("et=");
    if (etIndex !== -1) {
      let rest = options.substr(etIndex);
      const nIndex = rest.indexOf("&");
      const et = nIndex !== -1 ? rest.substr(0, nIndex) : rest;
      if (et.length > 3) {
        const theme = et.substr(3);
        if (EDIT_THEMES.includes(theme)) {
          preferences.edittheme = theme;
        }
      }
    }

    const edIndex = options.indexOf("ed=");
    if (edIndex !== -1) {
      let rest = options.substr(edIndex);
      const nIndex = rest.indexOf("&");
      const ed = nIndex !== -1 ? rest.substr(0, nIndex) : rest;
      if (ed.length > 3) {
        const type = ed.substr(3);
        if (["ide", "windows"].includes(type)) {
          preferences.editorType = type;
        }
      }
    }

    const clIndex = options.indexOf("cl=");
    if (clIndex !== -1) {
      let rest = options.substr(clIndex);
      const nIndex = rest.indexOf("&");
      const cl = nIndex !== -1 ? rest.substr(0, nIndex) : rest;
      if (cl.length > 3) {
        const colorset = cl.substr(3);
        if (COLORSET_CHOICES.includes(colorset)) {
          preferences.colorSet = colorset;
        }
      }
    }

    const pbIndex = options.indexOf("pb=");
    if (pbIndex !== -1) {
      let rest = options.substr(pbIndex);
      const nIndex = rest.indexOf("&");
      let pb = nIndex !== -1 ? rest.substr(0, nIndex) : rest;
      if (pb.length > 3) {
        pb = parseInt(pb.substr(3), 10);
        if (pb > 0) {
          preferences.performanceBuffer = pb;
        }
      }
    }

    if (options.indexOf("to=false") != -1) {
      preferences.transparentOverlay = false;
    }

    if (options.indexOf("bs=false") != -1) {
      preferences.broadSearch = false;
    }
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

const PREFERENCE_ENUM = {
  "cs" : { name: "commandSuggestions", storeKey: "commands", def: true },
  "su" : { name: "shortenUrls", storeKey: "shorten", def: true },
  "pd" : { name: "playDing", storeKey: "playding", def: true },
  "le" : { name: "localEcho", storeKey: "localecho", def: false },
  "iv" : { name: "imagePreview", storeKey: "imageview", def: false },
  "lc" : { name: "inlineLogCss", storeKey: "logcss", def: true },
  "nw" : { name: "sdwcNowrapBlocks", storeKey: "sdwcnowrap", def: false },
  "up" : { name: "scrollUpToPause", storeKey: "scrolluppause", def: false },
  "as" : { name: "autoScroll", storeKey: "scroll", def: "dbl", valid: ["dbl", "long", "none"] },
  "of" : { name: "lineBufferFont", storeKey: "outfont", def: "standard", valid: FONT_CHOICES },
  "ef" : { name: "editorFont", storeKey: "editorfont", def: "standard", valid: FONT_CHOICES },
  "et" : { name: "edittheme", storeKey: "edittheme", def: "twilight", valid: EDIT_THEMES },
  "ed" : { name: "editorType", storeKey: "edittype", def: "ide", valid: ["ide", "windows"] },
  "cl" : { name: "colorSet", storeKey: "colorset", def: "normal", valid: COLORSET_CHOICES },
  "to" : { name: "transparentOverlay", storeKey: "transparent", def: true },
  "bs" : { name: "broadSearch", storeKey: "broadly", def: true },
  "pb" : { name: "performanceBuffer", storeKey: "buffer", def: ( dome.weakBrowser() ? 1750 : 0 ) }
};

const helpDocs = [
  "Help on @client-option:\n",
  "  @client-options\n",
  "  @client-option &lt;option name&gt; [&lt;new value&gt;]\n",
  "\n",
  "  Options Include:\n"
];

for (const shortCode in PREFERENCE_ENUM) {
  const prefName = PREFERENCE_ENUM[shortCode].name;
  PREFERENCE_ENUM[prefName] = PREFERENCE_ENUM[shortCode];
  helpDocs[helpDocs.length] = "   [" + shortCode + "] " + prefName + "\n";
}

const CLIENT_OPTION_NAME_ERROR = "Unknown @client-option specified, check @client-options" + "\n";
const CLIENT_OPTION_VALUE_ERROR = "Invalid @client-option value, must be one of ";
const CLIENT_OPTIONS_HELP = helpDocs;

const showClientOptionHelp = function() {
  dome.buffer.append(CLIENT_OPTIONS_HELP);
};
const translateClientOptionName = function(optionName) {
  if (PREFERENCE_ENUM[ optionName ] != null) {
    return PREFERENCE_ENUM[ optionName ].name;
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
};

dome.applyTransparentOverlayPreference = applyTransparentOverlayPreference;

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
  const prefDef = PREFERENCE_ENUM[ optionName ].def;
  if (typeof prefDef === "number" && typeof optionValue === "string") {
    const num = Number(optionValue);
    if (!Number.isNaN(num)) {
      optionValue = num;
    }
  }

  const validValues = PREFERENCE_ENUM[ optionName ].valid || (typeof prefDef === "boolean" ? [true, false] : null);

  if (validValues && !validValues.includes(optionValue)) {
    return dome.buffer?.append(CLIENT_OPTION_VALUE_ERROR + validValues.toString() + "\n");
  }

  clientOptions.save( PREFERENCE_ENUM[ optionName ].storeKey, optionValue );

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
