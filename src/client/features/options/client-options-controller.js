import {
  CLIENT_OPTION_NAME_ERROR,
  CLIENT_OPTION_VALUE_ERROR,
  buildClientOptionsHelp,
  getClientOptionDefinition,
  parseClientOptionCommandIntent,
  readClientPreferences,
  validateClientOptionValue
} from "./client-option-parser.js";
import { createClientOptionEffects } from "./client-option-effects.js";
import { createClientPreferenceDomAppliers } from "./client-preference-dom.js";
import { setupAutoscroll } from "../terminal/autoscroll.js";
import { setupAutoCompleteFeature } from "../terminal/autocomplete.js";

const CLIENT_OPTIONS_HELP = buildClientOptionsHelp();

function createNoopOptions() {
  return {
    prefix: "dc-toggle-",
    save() {}
  };
}

function createNoopStorage() {
  return {
    get() {
      return null;
    },
    put() {}
  };
}

export function createClientOptionsController({
  client,
  doc = globalThis.document,
  win = globalThis.window,
  storage = createNoopStorage(),
  options = createNoopOptions(),
  setupAutoscrollFn = setupAutoscroll,
  setupAutoCompleteFeatureFn = setupAutoCompleteFeature
} = {}) {
  const shortenFeatureEnabled = typeof win === "undefined" ? true : win.shortenEnabled !== false;
  const {
    applyInputReaderColorPreferences,
    applyInputReaderTextPreferences,
    applyOutputBufferTextPreferences,
    applyTransparentOverlayPreference
  } = createClientPreferenceDomAppliers({ client, doc });
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

  function readPreferences() {
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
  }

  function setOption(optionName, optionValue, { source = "command" } = {}) {
    const optionDef = getClientOptionDefinition(optionName);
    if (!optionDef) {
      return {
        ok: false,
        status: "invalid-option",
        error: CLIENT_OPTION_NAME_ERROR
      };
    }

    if (optionDef.preferenceName === "shortenUrls" && !shortenFeatureEnabled) {
      options.save(optionDef.key, false);
      if (client.preferences) {
        client.preferences.shortenUrls = false;
      }
      return {
        ok: true,
        status: "disabled-feature",
        optionDef,
        preferenceName: optionDef.preferenceName,
        value: false,
        source
      };
    }

    const validation = validateClientOptionValue(optionDef.preferenceName, optionValue);
    if (!validation.valid) {
      return {
        ok: false,
        status: "invalid-value",
        optionDef,
        preferenceName: optionDef.preferenceName,
        value: validation.value,
        error: validation.error || CLIENT_OPTION_VALUE_ERROR + "\n",
        source
      };
    }

    const nextValue = validation.value;
    const previousValue = client.preferences?.[optionDef.preferenceName];

    options.save(optionDef.key, nextValue);

    if (client.preferences && previousValue != nextValue) {
      client.preferences[optionDef.preferenceName] = nextValue;
      optionEffects.apply(optionDef.preferenceName, nextValue, previousValue);
      return {
        ok: true,
        status: "changed",
        optionDef,
        preferenceName: optionDef.preferenceName,
        previousValue,
        value: nextValue,
        source
      };
    }

    return {
      ok: true,
      status: "unchanged",
      optionDef,
      preferenceName: optionDef.preferenceName,
      previousValue,
      value: nextValue,
      source
    };
  }

  function listOptions(optionName) {
    let opts = Object.keys(client.preferences);
    if (optionName) {
      if (!Object.prototype.hasOwnProperty.call(client.preferences, optionName)) {
        return { ok: false, output: CLIENT_OPTION_NAME_ERROR };
      }
      opts = [optionName];
    }

    return {
      ok: true,
      output: opts.map((opt) => "  " + opt + " : " + client.preferences[opt] + "\n").join("")
    };
  }

  function parseCommand(command) {
    const intent = parseClientOptionCommandIntent(command);
    if (intent.type === "list") {
      return { intent, ...listOptions() };
    }
    if (intent.type === "help") {
      return { intent, ok: true, output: CLIENT_OPTIONS_HELP };
    }
    if (intent.type === "read") {
      return { intent, ...listOptions(intent.optionName) };
    }
    if (intent.type === "write") {
      return {
        intent,
        ...setOption(intent.optionName, intent.value, { source: "command" })
      };
    }

    return { intent, ok: true, output: CLIENT_OPTIONS_HELP };
  }

  return {
    applyInputReaderColorPreferences,
    applyInputReaderTextPreferences,
    applyOutputBufferTextPreferences,
    applyTransparentOverlayPreference,
    optionEffects,
    parseCommand,
    readPreferences,
    setOption
  };
}
