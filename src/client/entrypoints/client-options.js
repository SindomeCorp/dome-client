import { store } from "../core/store.js";
import {
  COLORSET_CHOICES,
  EDIT_THEMES,
  FONT_CHOICES
} from "../../shared/client-options.js";
import { clientOptions, getClientOptionsActions, setClientOptionsActions } from "../features/options/client-options-runtime.js";
import { showClientOptionsSaved } from "../features/options/client-options-toast.js";
import { setupClientOptionsTabs } from "../features/options/page/tabs.js";
import { setupStandaloneOutputOptions } from "../features/output-windows/standalone-options.js";
import { bindOptionButtons, bindOptionInputs, bindOptionSelects, bindImportExportControls, buildExportPayload, importClientOptionsJson, refreshClientOptions } from "../features/options/client-options-controls.js";
import { setupContextMenus } from "../features/context-menus/controller.js";

// Expose color set choices for modules that read from the window object.
if (typeof window !== "undefined" && !window.COLORSET_CHOICES) {
  window.COLORSET_CHOICES = COLORSET_CHOICES;
}

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
    if (!document.querySelector("#output-workspace")) {
      setupContextMenus({ doc: document, win: window });
      const { actions } = setupStandaloneOutputOptions({ doc: document, win: window, storage: store, onSave: showClientOptionsSaved });
      setClientOptionsActions({ ...getClientOptionsActions(), ...actions });
    }
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
