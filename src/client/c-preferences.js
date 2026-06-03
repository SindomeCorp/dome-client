import { logger } from "./b-variables.js";
import {
  store,
  clientOptions,
  setClientOptionsActions
} from "./pages/client-options.js";
import { createClientOptionsController } from "./client-options-controller.js";
import { setupAutoscroll } from "./t-autoscroll.js";
import { setupAutoCompleteFeature } from "./w-autocomplete.js";

export function createClientOptionsActions({ client, doc, win, setupAutoscrollFn = setupAutoscroll }) {
  return {
    setClientOption: (name, value, meta) => client.setClientOption?.(name, value, meta),
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
  const controller = createClientOptionsController({
    client,
    doc,
    win,
    storage,
    options,
    setupAutoscrollFn,
    setupAutoCompleteFeatureFn
  });
  client.clientOptionsController = controller;

  Object.assign(client, {
    applyInputReaderColorPreferences: controller.applyInputReaderColorPreferences,
    applyInputReaderTextPreferences: controller.applyInputReaderTextPreferences,
    applyOutputBufferTextPreferences: controller.applyOutputBufferTextPreferences,
    applyTransparentOverlayPreference: controller.applyTransparentOverlayPreference
  });

  client.readPreferences = controller.readPreferences;

  const setClientOption = function(optionName, optionValue, meta = {}) {
    const result = controller.setOption(optionName, optionValue, meta);
    if (!result.ok) {
      client.buffer?.append(result.error);
    } else if (result.status === "changed") {
      client.buffer?.append("changing @client-option " + result.preferenceName + " to " + result.value + "\n");
    }
    return result;
  };

  client.setClientOption = setClientOption;

  client.parseClientOptionCommand = function( command ) {
    logger.debug( command );
    const result = controller.parseCommand(command);
    if (result.output) {
      client.buffer?.append(result.output);
    } else if (!result.ok) {
      client.buffer?.append(result.error);
    } else if (result.status === "changed") {
      client.buffer?.append("changing @client-option " + result.preferenceName + " to " + result.value + "\n");
    }
    if (client.scrollBuffer) client.scrollBuffer();
    return result;
  };

  setClientOptionsActions(createClientOptionsActions({ client, doc, win, setupAutoscrollFn }));
  return controller;
}
