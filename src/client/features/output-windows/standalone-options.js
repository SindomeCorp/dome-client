import { createNextSplit, MAX_ADDITIONAL_SPLITS, normalizeOutputWindows, outputWindowDefaults, OUTPUT_WINDOWS_STORAGE_KEY } from "../../../shared/output-windows.js";
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
    addSplit(initialSelected = []) {
      if (!this.config.enabled || (this.settings.splits || []).length >= MAX_ADDITIONAL_SPLITS) return null;
      const split = createNextSplit(this.settings.splits, initialSelected);
      this.updateSettings({ open: true, splits: [...(this.settings.splits || []), split] });
      return split;
    },
    closeSplit(panelName = "secondary") {
      if (panelName && panelName !== "secondary" && panelName !== "all") {
        const splits = (this.settings.splits || []).filter((split) => split.id !== panelName);
        this.updateSettings({ splits });
        return true;
      }
      this.updateSettings({ open: false });
      return true;
    },
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
        const existingSplits = new Map((model.settings.splits || []).map((split) => [split.id, split]));
        result.value.splits = (result.value.splits || []).map((split) => ({
          ...split,
          selected: split.selected.filter((id) => !id.startsWith("custom-"))
            .concat((existingSplits.get(split.id)?.selected || []).filter((id) => id.startsWith("custom-")))
        }));
      }
      if (result.valid) model.updateSettings(result.value);
      return result;
    },
    resetOutputWindows: () => model.updateSettings(outputWindowDefaults())
  };
  win.addEventListener("pagehide", () => model.runner.cancel(), { once: true });
  return { model, actions };
}
