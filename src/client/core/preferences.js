import { logger } from "./constants.js";
import {
  store,
  clientOptions,
  setClientOptionsActions
} from "../entrypoints/client-options.js";
import { createClientOptionsController } from "../features/options/client-options-controller.js";
import { setupAutoscroll } from "../features/terminal/autoscroll.js";
import { setupAutoCompleteFeature } from "../features/terminal/autocomplete.js";

function appendClientOutput(client, text) {
  if (client.outputWindows) client.outputWindows.appendLocal(text);
  else client.buffer?.append(text);
}

export function createClientOptionsActions({ client, doc, win, setupAutoscrollFn = setupAutoscroll }) {
  return {
    setClientOption: (name, value, meta) => client.setClientOption?.(name, value, meta),
    parseClientOptionCommand: (command) => client.parseClientOptionCommand?.(command),
    appendOutput: (text) => appendClientOutput(client, text),
    getOutputWindows: () => client.outputWindows?.settings,
    importOutputWindows: (value) => client.outputWindows?.importSettings(value),
    resetOutputWindows: () => client.outputWindows?.resetSettings(),
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
      appendClientOutput(client, result.error);
    } else if (result.status === "changed") {
      appendClientOutput(client, "changing @client-option " + result.preferenceName + " to " + result.value + "\n");
    }
    return result;
  };

  client.setClientOption = setClientOption;

  client.parseClientOptionCommand = function( command ) {
    logger.debug( command );
    const result = controller.parseCommand(command);
    if (result.output) {
      appendClientOutput(client, result.output);
    } else if (!result.ok) {
      appendClientOutput(client, result.error);
    } else if (result.status === "changed") {
      appendClientOutput(client, "changing @client-option " + result.preferenceName + " to " + result.value + "\n");
    }
    if (client.scrollBuffer) client.scrollBuffer();
    return result;
  };

  setClientOptionsActions(createClientOptionsActions({ client, doc, win, setupAutoscrollFn }));
  return controller;
}
