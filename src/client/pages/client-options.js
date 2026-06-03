import logger from "./logger.js";
import { store } from "../store.js";
import {
  COLORSET_CHOICES,
  EDIT_THEMES,
  FONT_CHOICES
} from "../client-option-schema.js";
import { createClientOptionsStore } from "../client-options-store.js";
import { showClientOptionsSaved, showImportExportToast } from "../client-options-toast.js";
import { createClientOptionControlBinder } from "../client-options-page/controls.js";
import { createClientOptionsImportExportBinder } from "../client-options-page/import-export.js";
import { setupClientOptionsTabs } from "../client-options-page/tabs.js";

// Expose color set choices for modules that read from the window object.
if (typeof window !== "undefined" && !window.COLORSET_CHOICES) {
  window.COLORSET_CHOICES = COLORSET_CHOICES;
}

const clientOptions = createClientOptionsStore({
  storage: store,
  onSave: () => showClientOptionsSaved()
});

const createDefaultActions = () => ({
  setClientOption() {},
  parseClientOptionCommand() {},
  appendOutput() {},
  scrollBuffer() {},
  refreshAutoscroll() {},
  getPreference() {
    return undefined;
  },
  setPreference() {}
});

let clientActions = createDefaultActions();
const getClientOptionsActions = () => clientActions;

function setClientOptionsActions(actions = {}) {
  clientActions = {
    ...createDefaultActions(),
    ...actions
  };
}

const optionControls = createClientOptionControlBinder({
  options: clientOptions,
  getActions: getClientOptionsActions,
  logger
});
const {
  applyOptionValue,
  bindOptionButtons,
  bindOptionInputs,
  bindOptionSelects,
  refreshClientOptions
} = optionControls;
const importExportControls = createClientOptionsImportExportBinder({
  options: clientOptions,
  getActions: getClientOptionsActions,
  applyOptionValue,
  refreshClientOptions,
  showToast: showImportExportToast
});
const {
  bindImportExportControls,
  buildExportPayload,
  importClientOptionsJson
} = importExportControls;

export {
  store,
  clientOptions,
  EDIT_THEMES,
  FONT_CHOICES,
  COLORSET_CHOICES,
  bindOptionButtons,
  bindOptionInputs,
  bindOptionSelects,
  bindImportExportControls,
  buildExportPayload,
  importClientOptionsJson,
  refreshClientOptions,
  setClientOptionsActions
};

if (globalThis.document && globalThis.window) {
  document.addEventListener("DOMContentLoaded", () => {
    if (window.__domeClientOptionsInitialized) return;
    window.__domeClientOptionsInitialized = true;
    // allow scrolling without showing a scrollbar
    document.body.style.overflowY = "auto";
    document.body.style.msOverflowStyle = "none";
    document.body.style.scrollbarWidth = "none";
    const hideScrollbar = document.createElement("style");
    hideScrollbar.textContent = "body::-webkit-scrollbar { display: none; }";
    document.head.appendChild(hideScrollbar);

    refreshClientOptions();
    setupClientOptionsTabs();
    bindImportExportControls();
    bindOptionSelects();
    bindOptionButtons();
    bindOptionInputs();
  });
}
