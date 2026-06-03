import {
  CLIENT_OPTION_BY_PARAM,
  CLIENT_OPTION_BY_PREFERENCE,
  CLIENT_OPTION_DEFINITIONS,
  CLIENT_OPTION_STORAGE_PREFIX,
  buildPreferenceDefaults,
  coerceOptionValue,
  getClientOptionStorageKey
} from "./client-option-schema.js";

export const CLIENT_OPTION_NAME_ERROR = "Unknown @client-option specified, check @client-options\n";
export const CLIENT_OPTION_VALUE_ERROR = "Invalid @client-option value, must be one of ";

const OPTION_BY_COMMAND_NAME = {
  ...Object.fromEntries(CLIENT_OPTION_DEFINITIONS.map((option) => [option.key, option])),
  ...CLIENT_OPTION_BY_PARAM,
  ...CLIENT_OPTION_BY_PREFERENCE
};

export function getClientOptionDefinition(optionName) {
  return OPTION_BY_COMMAND_NAME[optionName] ?? null;
}

export function translateClientOptionName(optionName) {
  return getClientOptionDefinition(optionName)?.preferenceName ?? optionName;
}

export function buildClientOptionsHelp() {
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

  return helpDocs;
}

export function readClientPreferences({
  locationSearch = "",
  getStoredValue = () => null,
  storagePrefix = CLIENT_OPTION_STORAGE_PREFIX,
  shortenFeatureEnabled = true
} = {}) {
  const preferences = buildPreferenceDefaults();
  const persistenceUpdates = [];

  CLIENT_OPTION_DEFINITIONS.forEach((option) => {
    const saved = getStoredValue(getClientOptionStorageKey(option.key, storagePrefix));
    if (saved !== null) {
      preferences[option.preferenceName] = saved;
    }
  });

  if (locationSearch) {
    const searchParams = new URLSearchParams(locationSearch);
    CLIENT_OPTION_DEFINITIONS.forEach((option) => {
      if (!searchParams.has(option.param)) return;
      const rawValue = searchParams.get(option.param);
      const coerced = coerceOptionValue(option, rawValue);
      if (coerced.valid && !(option.key === "buffer" && coerced.value <= 0)) {
        preferences[option.preferenceName] = coerced.value;
      }
    });
  }

  const editorFontStorageKey = getClientOptionStorageKey("editorfont", storagePrefix);
  if (getStoredValue(editorFontStorageKey) === null && !(locationSearch && locationSearch.includes("ef="))) {
    preferences.editorFont = preferences.lineBufferFont;
    persistenceUpdates.push({ key: editorFontStorageKey, value: preferences.editorFont });
  }

  if (!shortenFeatureEnabled) {
    preferences.shortenUrls = false;
    persistenceUpdates.push({ key: getClientOptionStorageKey("shorten", storagePrefix), value: false });
  }

  return { preferences, persistenceUpdates };
}

export function parseClientOptionCommandIntent(command) {
  if (command === "@client-options") {
    return { type: "list" };
  }

  const commandParts = command.split(" ");
  if (commandParts.length < 2) {
    return { type: "help" };
  }

  const optionName = translateClientOptionName(commandParts[1]);
  if (commandParts.length < 3) {
    return { type: "read", optionName };
  }

  return { type: "write", optionName, value: commandParts[2] };
}

export function validateClientOptionValue(optionName, optionValue) {
  const optionDef = getClientOptionDefinition(optionName);
  if (!optionDef) {
    return { valid: false, value: optionValue, error: CLIENT_OPTION_NAME_ERROR };
  }

  const coerced = coerceOptionValue(optionDef, optionValue);
  const nextValue = coerced.value;

  if (optionName === "lineBufferFontSizePt" || optionName === "inputFontSizePt") {
    if (typeof nextValue !== "number" || Number.isNaN(nextValue)) {
      return {
        valid: false,
        value: nextValue,
        error: "Invalid @client-option value, must be a number between 8 and 24\n"
      };
    }
    if (nextValue < 8 || nextValue > 24) {
      return {
        valid: false,
        value: nextValue,
        error: "Invalid @client-option value, must be between 8 and 24\n"
      };
    }
  }

  if ((optionName === "inputFontColor" || optionName === "inputBackgroundColor") && !coerced.valid) {
    return {
      valid: false,
      value: nextValue,
      error: "Invalid @client-option value, must be a hex color like #AABBCC\n"
    };
  }

  const validValues = optionDef.ok || (typeof optionDef.def === "boolean" ? [true, false] : null);
  if (!coerced.valid && typeof optionDef.def === "number") {
    return {
      valid: false,
      value: nextValue,
      error: "Invalid @client-option value, must be a number\n"
    };
  }

  if (!coerced.valid && validValues) {
    return {
      valid: false,
      value: nextValue,
      error: CLIENT_OPTION_VALUE_ERROR + validValues.toString() + "\n"
    };
  }

  return { valid: coerced.valid, value: nextValue, optionDef };
}
