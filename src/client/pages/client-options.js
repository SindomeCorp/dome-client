import logger from "./logger.js";
import { dome } from "../b-variables.js";
import { store } from "../store.js";

const EDIT_THEMES = ["ambience", "chaos", "chrome", "clouds", "clouds_midnight", "cobalt", "crimson_editor", "dawn", "dreamweaver", "eclipse", "github", "idle_fingers", "kr_theme", "merbivore", "merbivore_soft", "mono_industrial", "monokai", "pastel_on_dark", "solarized_dark", "solarized_light", "terminal", "textmate", "tomorrow_night", "tomorrow_night_blue", "tomorrow_night_bright", "tomorrow_night_eighties", "twilight", "vibrant_ink", "xcode"];
const FONT_CHOICES = [
  "standard",
  "lucida",
  "courier",
  "roboto",
  "comic-mono",
  "monaco",
  "menlo",
  "ubuntu-mono",
  "consolas",
];
const COLORSET_CHOICES = ["normal", "dim", "slither", "acid", "corpie", "snow"];

// Expose color set choices for modules that read from the window object.
if (typeof window !== "undefined" && !window.COLORSET_CHOICES) {
  window.COLORSET_CHOICES = COLORSET_CHOICES;
}

function weakBrowser() {
  const chromeVersion = navigator?.appVersion?.match(/Chrome\/(\d+)/);
  const badChrome = chromeVersion != null && parseInt(chromeVersion[1]) >= 79;
  return badChrome;
}

const clientOptions = {
  options: {
    commands: { param: "cs", def: true, ok: [true, false] },
    shorten: { param: "su", def: true, ok: [true, false] },
    scroll: { param: "as", def: "dbl", ok: ["dbl", "long", "none"] },
    edittheme: { param: "et", def: "twilight", ok: EDIT_THEMES },
    edittype: { param: "ed", def: "ide", ok: ["ide", "windows"] },
    colorset: { param: "cl", def: "normal", ok: COLORSET_CHOICES },
    outfont: { param: "of", def: "standard", ok: FONT_CHOICES },
    outfontsize: { param: "oz", def: 9.75 },
    inputfont: { param: "if", def: "standard", ok: FONT_CHOICES },
    inputfontsize: { param: "iz", def: 11 },
    inputfontcolor: { param: "ic", def: "#EEEEEE" },
    inputbgcolor: { param: "ib", def: "#333333" },
    editorfont: { param: "ef", def: "standard", ok: FONT_CHOICES },
    playding: { param: "pd", def: true, ok: [true, false] },
    localecho: { param: "le", def: false, ok: [true, false] },
    imageview: { param: "iv", def: false, ok: [true, false] },
    logcss: { param: "lc", def: true, ok: [true, false] },
    sdwcnowrap: { param: "nw", def: false, ok: [true, false] },
    scrolluppause: { param: "up", def: false, ok: [true, false] },
    transparent: { param: "to", def: true, ok: [true, false] },
    broadly: { param: "bs", def: true, ok: [true, false] },
    buffer: { param: "pb", def: weakBrowser() ? 1750 : 0 }
  },
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

const PREF_NAME = {
  commands: "commandSuggestions",
  shorten: "shortenUrls",
  scroll: "autoScroll",
  edittheme: "edittheme",
  edittype: "editorType",
  colorset: "colorSet",
  outfont: "lineBufferFont",
  outfontsize: "lineBufferFontSizePt",
  inputfont: "inputFont",
  inputfontsize: "inputFontSizePt",
  inputfontcolor: "inputFontColor",
  inputbgcolor: "inputBackgroundColor",
  editorfont: "editorFont",
  playding: "playDing",
  localecho: "localEcho",
  imageview: "imagePreview",
  logcss: "inlineLogCss",
  sdwcnowrap: "sdwcNowrapBlocks",
  scrolluppause: "scrollUpToPause",
  transparent: "transparentOverlay",
  broadly: "broadSearch",
  buffer: "performanceBuffer"
};

function refreshClientOptions() {
  document.querySelectorAll("DIV.client-options-page DIV.option-row").forEach((row) => {
    const id = row.getAttribute("id");
    const name = id.replace("-option", "");
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

export { store, clientOptions, EDIT_THEMES, FONT_CHOICES, COLORSET_CHOICES, refreshClientOptions };

document.addEventListener("DOMContentLoaded", () => {
  // allow scrolling without showing a scrollbar
  document.body.style.overflowY = "auto";
  document.body.style.msOverflowStyle = "none";
  document.body.style.scrollbarWidth = "none";
  const hideScrollbar = document.createElement("style");
  hideScrollbar.textContent = "body::-webkit-scrollbar { display: none; }";
  document.head.appendChild(hideScrollbar);

  refreshClientOptions();
  setupClientOptionsTabs();

  document.querySelectorAll("DIV.client-options-page DIV.option-row SELECT").forEach((self) => {
    const id = self.parentElement.getAttribute("id").replace("-option", "");
    self.addEventListener("change", () => {
      const value = self.value;
      const prefName = PREF_NAME[id];
      if (prefName && dome.setClientOption) {
        dome.setClientOption(prefName, value);
      } else {
        clientOptions.save(id, value);
        if (id === "scroll") {
          if (dome.preferences) {
            dome.preferences.autoScroll = value;
          }
          dome.setupAutoscroll?.();
        } else if (id === "colorset") {
          dome.parseClientOptionCommand?.(`@client-option cl ${value}`);
        }
      }
      dome.scrollBuffer?.();
    });
  });

  document.querySelectorAll("DIV.client-options-page DIV.option-row BUTTON").forEach((self) => {
    self.addEventListener("click", () => {
      const btn = self;

      let val = btn.dataset.val;
      if (val == "true") {
        val = true;
      } else if (val == "false") {
        val = false;
      }

      const row = btn.closest("DIV.option-row");
      const name = row.getAttribute("id").replace("-option", "");

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
      const prefName = PREF_NAME[name];
      if (prefName && dome.setClientOption) {
        dome.setClientOption(prefName, val);
      } else {
        if (name === "transparent" && dome.parseClientOptionCommand) {
          dome.parseClientOptionCommand(`@client-option transparentOverlay ${val}`);
        } else {
          clientOptions.save(name, val);
        }
        if (name === "localecho") {
          if (dome.preferences) {
            dome.preferences.localEcho = val;
          }
        }
      }
      dome.scrollBuffer?.();
    });
  });

  document.querySelectorAll("DIV.client-options-page DIV.option-row INPUT").forEach((self) => {
    const row = self.closest("DIV.option-row");
    const name = row.getAttribute("id").replace("-option", "");

    self.addEventListener("change", () => {
      let fieldValue = self.value;
      if (self.dataset.colorHex === "true") {
        fieldValue = fieldValue.trim();
        if (!fieldValue.startsWith("#")) fieldValue = `#${fieldValue}`;
      }
      if (self.getAttribute("type") == "number") {
        fieldValue = fieldValue.indexOf(".") != -1 ? parseFloat(fieldValue) : parseInt(fieldValue);
      }
      logger.debug("" + typeof(fieldValue) + ": " + fieldValue);
      const prefName = PREF_NAME[name];
      if (prefName && dome.setClientOption) {
        dome.setClientOption(prefName, fieldValue);
        if (self.getAttribute("type") === "color" || self.dataset.colorHex === "true") {
          const updated = dome.preferences?.[prefName];
          if (typeof updated === "string") {
            row.querySelectorAll("input").forEach((input) => {
              input.value = updated;
            });
          }
        }
      } else {
        clientOptions.save(name, fieldValue);
      }
      dome.scrollBuffer?.();
    });
  });
});
