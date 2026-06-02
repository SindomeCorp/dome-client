import logger from "./logger.js";
import { dome } from "../b-variables.js";
import { store } from "../store.js";
import {
  COLORSET_CHOICES,
  EDIT_THEMES,
  FONT_CHOICES,
  PREF_NAME,
  buildClientOptionState
} from "../client-option-schema.js";
import {
  buildClientOptionsExportFilename,
  buildClientOptionsExportPayload,
  buildClientOptionsImportPlan
} from "../client-options-import-export.js";

// Expose color set choices for modules that read from the window object.
if (typeof window !== "undefined" && !window.COLORSET_CHOICES) {
  window.COLORSET_CHOICES = COLORSET_CHOICES;
}

const clientOptions = {
  options: buildClientOptionState(),
  prefix: "dc-toggle-", // namespacing options in localStorage
  get(name) {
    const option = this.options[name];
    if (!option) {
      throw new Error("invalid option name");
    }
    let state = store.get(this.prefix + name);
    if (state == null) {
      state = option.def;
    }
    option.state = state == "true" ? true : state == "false" ? false : state;
    return option;
  },
  save(name, value) {
    const option = this.options[name];
    if (!option) {
      throw new Error("invalid option name");
    }
    store.put(this.prefix + name, value);
    const indicator = document.getElementById("client-options-save-indicator");
    if (indicator) {
      indicator.classList.remove("hide");
      if (indicator._hideTimer) {
        clearTimeout(indicator._hideTimer);
      }
      indicator._hideTimer = setTimeout(() => {
        indicator.classList.add("hide");
      }, 1000);
      indicator._hideTimer.unref?.();
    }
  },
  buildQueryString() {
    let qs = "";
    for (const name in clientOptions.options) {
      const option = this.get(name);
      qs += qs == "" ? "" : "&";
      qs += option.param + "=" + encodeURIComponent(option.state);
    }
    return qs;
  }
};

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
  if (prefName && dome.setClientOption) {
    dome.setClientOption(prefName, value);
  } else {
    clientOptions.save(name, value);
    if (name === "scroll") {
      if (dome.preferences) {
        dome.preferences.autoScroll = value;
      }
      dome.setupAutoscroll?.();
    } else if (name === "colorset") {
      dome.parseClientOptionCommand?.(`@client-option cl ${value}`);
    }
  }
}

function showClientOptionsToast(message, isError = false) {
  const indicator = document.getElementById("client-options-save-indicator");
  if (!indicator) return;
  indicator.textContent = message;
  indicator.classList.toggle("is-error", isError);
  indicator.classList.remove("hide");
  if (indicator._hideTimer) {
    clearTimeout(indicator._hideTimer);
  }
  indicator._hideTimer = setTimeout(() => {
    indicator.classList.add("hide");
    indicator.classList.remove("is-error");
    indicator.textContent = "Saved";
  }, 1800);
  indicator._hideTimer.unref?.();
}

function showImportExportToast(message, isError = false) {
  const indicator = document.getElementById("client-options-import-export-indicator");
  if (!indicator) return;
  indicator.textContent = message;
  indicator.classList.toggle("is-error", isError);
  indicator.classList.remove("hide");
  if (indicator._hideTimer) {
    clearTimeout(indicator._hideTimer);
  }
  indicator._hideTimer = setTimeout(() => {
    indicator.classList.add("hide");
    indicator.classList.remove("is-error");
    indicator.textContent = "Saved";
  }, 2200);
  indicator._hideTimer.unref?.();
}

function buildExportPayload() {
  return buildClientOptionsExportPayload({
    optionNames: Object.keys(clientOptions.options),
    getOptionState: (name) => clientOptions.get(name).state
  });
}

function downloadClientOptionsJson() {
  if (typeof document === "undefined" || typeof Blob === "undefined") {
    dome.buffer?.append("Client options export is not supported in this environment.\n");
    dome.scrollBuffer?.();
    return;
  }
  const payload = buildExportPayload();
  const filename = buildClientOptionsExportFilename();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });

  const nav = typeof navigator !== "undefined" ? navigator : null;
  if (nav?.msSaveOrOpenBlob) {
    nav.msSaveOrOpenBlob(blob, filename);
    showImportExportToast("Preferences exported.");
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showImportExportToast("Preferences exported.");
}

async function importClientOptionsJson(file) {
  if (!file) return;
  let parsed;
  try {
    const text = await file.text();
    parsed = JSON.parse(text);
  } catch {
    dome.buffer?.append("Client options import error: invalid JSON file.\n");
    dome.scrollBuffer?.();
    showImportExportToast("Import failed.", true);
    return;
  }

  const plan = buildClientOptionsImportPlan({
    parsed,
    options: clientOptions.options
  });
  if (!plan.valid) {
    dome.buffer?.append(`Client options import error: ${plan.error}\n`);
    dome.scrollBuffer?.();
    showImportExportToast("Import failed.", true);
    return;
  }

  plan.applied.forEach(({ name, value }) => {
    applyOptionValue(name, value);
  });
  refreshClientOptions();
  dome.scrollBuffer?.();
  const applied = plan.applied.length;
  const skipped = plan.skipped;
  dome.buffer?.append(`Imported ${applied} client option${applied === 1 ? "" : "s"}.\n`);
  if (skipped > 0) {
    dome.buffer?.append(`Skipped ${skipped} invalid imported option value${skipped === 1 ? "" : "s"}.\n`);
  }
  showImportExportToast("Preferences imported.");
}

function bindImportExportControls() {
  const exportButton = document.getElementById("client-options-export");
  const importButton = document.getElementById("client-options-import");
  const importFileInput = document.getElementById("client-options-import-file");
  const resetDefaultsButton = document.getElementById("client-options-reset-defaults");
  if (!exportButton || !importButton || !importFileInput || !resetDefaultsButton) return;

  exportButton.addEventListener("click", () => {
    downloadClientOptionsJson();
  });

  importButton.addEventListener("click", () => {
    const message = "Importing preferences will overwrite your current settings. This is destructive. Export a backup first. Continue?";
    if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(message)) return;
    importFileInput.click();
  });

  importFileInput.addEventListener("change", async () => {
    const [file] = importFileInput.files || [];
    await importClientOptionsJson(file);
    importFileInput.value = "";
  });

  resetDefaultsButton.addEventListener("click", () => {
    const message = "Resetting to defaults will overwrite your current settings. This is destructive. Export a backup first. Continue?";
    if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(message)) return;

    Object.entries(clientOptions.options).forEach(([name, optionDef]) => {
      applyOptionValue(name, optionDef.def);
    });
    refreshClientOptions();
    dome.buffer?.append("Reset all client options to defaults.\n");
    dome.scrollBuffer?.();
    showImportExportToast("Defaults restored.");
  });
}

function bindOptionSelects({ root = document } = {}) {
  root.querySelectorAll("DIV.client-options-page DIV.option-row SELECT").forEach((self) => {
    const id = getOptionNameFromRow(self.parentElement);
    if (!id) return;
    self.addEventListener("change", () => {
      const value = self.value;
      applyOptionValue(id, value);
      dome.scrollBuffer?.();
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
      dome.scrollBuffer?.();
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
  const updated = dome.preferences?.[PREF_NAME[name]];
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
      if (PREF_NAME[name] && dome.setClientOption && (self.getAttribute("type") === "color" || self.dataset.colorHex === "true")) {
        syncColorInputs(row, name);
      }
      dome.scrollBuffer?.();
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
  refreshClientOptions
};

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
