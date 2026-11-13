import { normalizeOutputWindows, outputWindowDefaults, OUTPUT_WINDOWS_STORAGE_KEY } from "../../../shared/output-windows.js";
import { setupOutputOptions } from "./options-ui.js";
import { createRuleRunner } from "./rule-runner.js";

// The connection page exposes the same options before a terminal exists.
export function setupStandaloneOutputOptions({ doc, win, storage, onSave = () => {}, workerFactory }) {
  const config = win.__OUTPUT_WINDOWS__ || {};
  const model = {
    doc, win,
    settings: normalizeOutputWindows(storage.get(OUTPUT_WINDOWS_STORAGE_KEY)).value,
    config: { enabled: config.enabled !== false, customRegexEnabled: config.customRegexEnabled !== false, presets: config.presets || [] },
    isSplitOpen() { return this.config.enabled && this.settings.open; },
    updateSettings(patch) {
      this.settings = normalizeOutputWindows({ ...this.settings, ...patch }).value;
      storage.put(OUTPUT_WINDOWS_STORAGE_KEY, this.settings);
      this.runner.reset();
      this.options.refresh();
      onSave();
    }
  };
  model.runner = createRuleRunner({
    workerFactory,
    onError: (message) => {
      const error = doc.querySelector("#output-rule-error");
      if (error) error.textContent = message;
    }
  });
  model.options = setupOutputOptions(model);
  const actions = {
    getOutputWindows: () => model.settings,
    importOutputWindows(value) {
      const result = normalizeOutputWindows(value);
      if (result.valid && !model.config.customRegexEnabled) {
        result.skipped += result.value.custom.length;
        result.value.custom = model.settings.custom;
        result.value.selected = result.value.selected.filter((id) => !id.startsWith("custom-"))
          .concat(model.settings.selected.filter((id) => id.startsWith("custom-")));
      }
      if (result.valid) model.updateSettings(result.value);
      return result;
    },
    resetOutputWindows: () => model.updateSettings(outputWindowDefaults())
  };
  win.addEventListener("pagehide", () => model.runner.cancel(), { once: true });
  return { model, actions };
}
