import logger from "./logger.js";
import { store } from "../store.js";
import {
  COLORSET_CHOICES,
  EDIT_THEMES,
  FONT_CHOICES,
  PREF_NAME
} from "../client-option-schema.js";
import { createClientOptionsStore } from "../client-options-store.js";
import { showClientOptionsSaved, showImportExportToast } from "../client-options-toast.js";
import {
  bindImportExportControls as bindImportExportControlsUi,
  buildExportPayload as buildExportPayloadForOptions,
  importClientOptionsJson as importClientOptionsJsonForOptions
} from "../client-options-import-export-ui.js";

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

function setClientOptionsActions(actions = {}) {
  clientActions = {
    ...createDefaultActions(),
    ...actions
  };
}

function getOptionNameFromRow(row) {
  const id = row?.getAttribute("id") || "";
  if (!id.endsWith("-option")) return null;
  const name = id.slice(0, -"-option".length);
  if (!Object.prototype.hasOwnProperty.call(clientOptions.options, name)) return null;
  return name;
}

function refreshClientOptions() {
  document.querySelectorAll("DIV.client-options-page DIV.option-row").forEach((row) => {
    const name = getOptionNameFromRow(row);
    if (!name) return;
    const option = clientOptions.get(name);

    row.querySelectorAll("BUTTON.enabled-state, BUTTON.disabled-state").forEach((btn) => btn.classList.remove("btn-primary"));

    let active = "disabled-state";
    if (!option.ok || option.state == option.ok[0]) {
      active = "enabled-state";
    }
    const activeButton = row.querySelector("BUTTON." + active);
    if (activeButton) {
      activeButton.classList.add("btn-primary");
    }

    const select = row.querySelector("select");
    if (select) {
      select.querySelectorAll("option[selected]").forEach((opt) => opt.removeAttribute("selected"));
      const r = select.querySelector(`option[value="${option.state}"]`);
      if (r) {
        r.setAttribute("selected", true);
        select.value = option.state;
      }
    }

    const inputs = row.querySelectorAll("input");
    if (inputs.length > 0) {
      inputs.forEach((input) => {
        input.value = option.state;
      });
    }
  });
}

function activateClientOptionsTab(tabName) {
  document.querySelectorAll(".client-options-tab").forEach((tab) => {
    const active = tab.dataset.tab === tabName;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
    tab.setAttribute("tabindex", active ? "0" : "-1");
  });

  document.querySelectorAll(".client-options-panel").forEach((panel) => {
    panel.classList.toggle("hide", panel.dataset.tabPanel !== tabName);
  });
}

function setupClientOptionsTabs() {
  const tabs = Array.from(document.querySelectorAll(".client-options-tab"));
  if (tabs.length === 0) return;

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      activateClientOptionsTab(tab.dataset.tab);
    });
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      let nextIndex = index;
      if (event.key === "ArrowLeft") nextIndex = index === 0 ? tabs.length - 1 : index - 1;
      if (event.key === "ArrowRight") nextIndex = index === tabs.length - 1 ? 0 : index + 1;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = tabs.length - 1;
      const nextTab = tabs[nextIndex];
      activateClientOptionsTab(nextTab.dataset.tab);
      nextTab.focus();
    });
  });

  const activeTab = tabs.find((tab) => tab.classList.contains("active")) ?? tabs[0];
  activateClientOptionsTab(activeTab.dataset.tab);
}

function applyOptionValue(name, value) {
  const prefName = PREF_NAME[name];
  if (prefName && clientActions.setClientOption) {
    clientActions.setClientOption(prefName, value);
  } else {
    clientOptions.save(name, value);
    if (name === "scroll") {
      clientActions.setPreference("autoScroll", value);
      clientActions.refreshAutoscroll();
    } else if (name === "colorset") {
      clientActions.parseClientOptionCommand(`@client-option cl ${value}`);
    }
  }
}

function buildExportPayload() {
  return buildExportPayloadForOptions({ options: clientOptions });
}

async function importClientOptionsJson(file) {
  await importClientOptionsJsonForOptions({
    file,
    options: clientOptions,
    actions: clientActions,
    applyOptionValue,
    refreshClientOptions,
    showToast: showImportExportToast
  });
}

function bindImportExportControls() {
  bindImportExportControlsUi({
    options: clientOptions,
    actions: clientActions,
    applyOptionValue,
    refreshClientOptions,
    showToast: showImportExportToast
  });
}

function bindOptionSelects({ root = document } = {}) {
  root.querySelectorAll("DIV.client-options-page DIV.option-row SELECT").forEach((self) => {
    const id = getOptionNameFromRow(self.parentElement);
    if (!id) return;
    self.addEventListener("change", () => {
      const value = self.value;
      applyOptionValue(id, value);
      clientActions.scrollBuffer();
    });
  });
}

function bindOptionButtons({ root = document } = {}) {
  root.querySelectorAll("DIV.client-options-page DIV.option-row BUTTON.enabled-state, DIV.client-options-page DIV.option-row BUTTON.disabled-state").forEach((self) => {
    self.addEventListener("click", () => {
      const btn = self;

      let val = btn.dataset.val;
      if (val == "true") {
        val = true;
      } else if (val == "false") {
        val = false;
      }

      const row = btn.closest("DIV.option-row");
      const name = getOptionNameFromRow(row);
      if (!name) return;

      // find the other button matching this button
      const otherBtn = row.querySelector(btn.classList.contains("enabled-state") ? "BUTTON.disabled-state" : "BUTTON.enabled-state");

      if (btn.classList.contains("btn-primary")) {
        btn.classList.remove("btn-primary");
        if (otherBtn) {
          otherBtn.classList.add("btn-primary");
        }
      } else {
        if (otherBtn) {
          otherBtn.classList.remove("btn-primary");
        }
        btn.classList.add("btn-primary");
      }
      applyOptionValue(name, val);
      clientActions.scrollBuffer();
    });
  });
}

function readOptionInputValue(input) {
  let fieldValue = input.value;
  if (input.dataset.colorHex === "true") {
    fieldValue = fieldValue.trim();
    if (!fieldValue.startsWith("#")) fieldValue = `#${fieldValue}`;
  }
  if (input.getAttribute("type") == "number") {
    fieldValue = fieldValue.indexOf(".") != -1 ? parseFloat(fieldValue) : parseInt(fieldValue);
  }
  return fieldValue;
}

function syncColorInputs(row, name) {
  const updated = clientActions.getPreference(PREF_NAME[name]);
  if (typeof updated === "string") {
    row.querySelectorAll("input").forEach((input) => {
      input.value = updated;
    });
  }
}

function bindOptionInputs({ root = document } = {}) {
  root.querySelectorAll("DIV.client-options-page DIV.option-row INPUT").forEach((self) => {
    if (self.getAttribute("type") === "file") return;
    const row = self.closest("DIV.option-row");
    const name = getOptionNameFromRow(row);
    if (!name) return;

    self.addEventListener("change", () => {
      const fieldValue = readOptionInputValue(self);
      logger.debug("" + typeof(fieldValue) + ": " + fieldValue);
      applyOptionValue(name, fieldValue);
      if (PREF_NAME[name] && (self.getAttribute("type") === "color" || self.dataset.colorHex === "true")) {
        syncColorInputs(row, name);
      }
      clientActions.scrollBuffer();
    });
  });
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
