import { logger } from "./b-variables.js";
import {
  store,
  clientOptions,
  setClientOptionsActions
} from "./pages/client-options.js";
import { createClientOptionEffects } from "./client-option-effects.js";
import { createClientPreferenceDomAppliers } from "./client-preference-dom.js";
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

  const {
    applyInputReaderColorPreferences,
    applyInputReaderTextPreferences,
    applyOutputBufferTextPreferences,
    applyTransparentOverlayPreference
  } = createClientPreferenceDomAppliers({ client, doc });

  Object.assign(client, {
    applyInputReaderColorPreferences,
    applyInputReaderTextPreferences,
    applyOutputBufferTextPreferences,
    applyTransparentOverlayPreference
  });

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
