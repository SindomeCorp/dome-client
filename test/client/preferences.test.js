import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { dome } from "../../src/client/b-variables.js";

const prefUrl = "../../src/client/c-preferences.js";

const setupWindow = async (
  t,
  url,
  appVersion,
  fontChoices = ["standard", "lucida"],
  editThemes = ["twilight", "chaos"],
  colorSets = ["acid", "dim"]
) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url });
  const { window } = dom;
  Object.defineProperty(window.navigator, "appVersion", { value: appVersion, configurable: true });
  window.dome = dome;
  window.FONT_CHOICES = fontChoices;
  window.EDIT_THEMES = editThemes;
  window.COLORSET_CHOICES = colorSets;
  const orig = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    localStorage: globalThis.localStorage,
    dome: global.dome,
    FONT_CHOICES: global.FONT_CHOICES,
    EDIT_THEMES: global.EDIT_THEMES,
    COLORSET_CHOICES: global.COLORSET_CHOICES
  };
  Object.defineProperty(globalThis, "window", { value: window, configurable: true, writable: true });
  Object.defineProperty(globalThis, "document", { value: window.document, configurable: true, writable: true });
  Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true, writable: true });
  Object.defineProperty(globalThis, "localStorage", { value: window.localStorage, configurable: true, writable: true });
  global.dome = dome;
  global.FONT_CHOICES = window.FONT_CHOICES;
  global.EDIT_THEMES = window.EDIT_THEMES;
  global.COLORSET_CHOICES = window.COLORSET_CHOICES;
  const storeData = new Map();
  const store = {
    get: (k) => (storeData.has(k) ? storeData.get(k) : null),
    put: (k, v) => storeData.set(k, v)
  };
  const clientOptions = {
    prefix: "dc-toggle-",
    save(name, value) {
      store.put(this.prefix + name, value);
    }
  };
  const clientOptionsMock = t.mock.module("../../src/client/pages/client-options.js", {
    namedExports: {
      store,
      clientOptions,
      EDIT_THEMES: globalThis.EDIT_THEMES || [],
      FONT_CHOICES: globalThis.FONT_CHOICES || [],
      COLORSET_CHOICES: globalThis.COLORSET_CHOICES || []
    }
  });
  t.after(() => {
    Object.defineProperty(globalThis, "window", { value: orig.window, configurable: true, writable: true });
    Object.defineProperty(globalThis, "document", { value: orig.document, configurable: true, writable: true });
    Object.defineProperty(globalThis, "navigator", { value: orig.navigator, configurable: true, writable: true });
    Object.defineProperty(globalThis, "localStorage", { value: orig.localStorage, configurable: true, writable: true });
    global.dome = orig.dome;
    global.FONT_CHOICES = orig.FONT_CHOICES;
    global.EDIT_THEMES = orig.EDIT_THEMES;
    global.COLORSET_CHOICES = orig.COLORSET_CHOICES;
  });
  t.after(() => clientOptionsMock.restore());
  await import(`${prefUrl}?c=${Date.now()}`);
  return window;
};

test("weakBrowser detects Chrome version", async (t) => {
  const win = await setupWindow(t, "https://example.com/", "Chrome/80");
  assert.equal(win.dome.weakBrowser(), true);
  Object.defineProperty(win.navigator, "appVersion", { value: "Chrome/78", configurable: true });
  assert.equal(win.dome.weakBrowser(), false);
});

test("readPreferences returns defaults", async (t) => {
  const win = await setupWindow(t, "https://example.com/", "Chrome/78");
  const prefs = win.dome.readPreferences();
  assert.equal(prefs.commandSuggestions, true);
  assert.equal(prefs.shortenUrls, true);
  assert.equal(prefs.autoScroll, "dbl");
  assert.equal(prefs.broadSearch, true);
  assert.equal(prefs.inlineLogCss, true);
  assert.equal(prefs.sdwcNowrapBlocks, false);
  assert.equal(prefs.scrollUpToPause, false);
  assert.equal(prefs.transparentOverlay, true);
  assert.equal(prefs.performanceBuffer, 0);
});

test("readPreferences parses url options", async (t) => {
  const url = "https://example.com/?cs=false&su=false&pd=false&le=true&iv=true&lc=false&nw=true&up=true&as=none&to=false&bs=false";
  const win = await setupWindow(t, url, "Chrome/78");
  const prefs = win.dome.readPreferences();
  assert.equal(prefs.commandSuggestions, false);
  assert.equal(prefs.shortenUrls, false);
  assert.equal(prefs.playDing, false);
  assert.equal(prefs.localEcho, true);
  assert.equal(prefs.imagePreview, true);
  assert.equal(prefs.inlineLogCss, false);
  assert.equal(prefs.sdwcNowrapBlocks, true);
  assert.equal(prefs.scrollUpToPause, true);
  assert.equal(prefs.autoScroll, "none");
  assert.equal(prefs.transparentOverlay, false);
  assert.equal(prefs.broadSearch, false);
});

test("readPreferences parses additional url options", async (t) => {
  const url = "https://example.com/?as=long&of=lucida&ef=courier&et=chaos&cl=dim&pb=42";
  const win = await setupWindow(t, url, "Chrome/78", ["standard", "lucida", "courier"]);
  const prefs = win.dome.readPreferences();
  assert.equal(prefs.autoScroll, "long");
  assert.equal(prefs.lineBufferFont, "lucida");
  assert.equal(prefs.editorFont, "courier");
  assert.equal(prefs.edittheme, "chaos");
  assert.equal(prefs.colorSet, "dim");
  assert.equal(prefs.performanceBuffer, 42);
});

test("readPreferences handles comic-mono font", async (t) => {
  const url = "https://example.com/?of=comic-mono";
  const win = await setupWindow(t, url, "Chrome/78", ["standard", "lucida", "comic-mono"]);
  const prefs = win.dome.readPreferences();
  assert.equal(prefs.lineBufferFont, "comic-mono");
});

test("readPreferences handles monaco font", async (t) => {
  const url = "https://example.com/?of=monaco";
  const win = await setupWindow(t, url, "Chrome/78", ["standard", "monaco"]);
  const prefs = win.dome.readPreferences();
  assert.equal(prefs.lineBufferFont, "monaco");
});

test("readPreferences defaults performanceBuffer for weak browsers", async (t) => {
  const win = await setupWindow(t, "https://example.com/", "Chrome/80");
  const prefs = win.dome.readPreferences();
  assert.equal(prefs.performanceBuffer, 1750);
});

test("readPreferences loads saved colorSet from localStorage", async (t) => {
  const win = await setupWindow(t, "https://example.com/", "Chrome/78");
  const { clientOptions } = await import("../../src/client/pages/client-options.js");
  clientOptions.save("colorset", "acid");
  const prefs = win.dome.readPreferences();
  assert.equal(prefs.colorSet, "acid");
});

test("readPreferences loads saved scrollUpToPause from localStorage", async (t) => {
  const win = await setupWindow(t, "https://example.com/", "Chrome/78");
  const { clientOptions } = await import("../../src/client/pages/client-options.js");
  clientOptions.save("scrolluppause", true);
  const prefs = win.dome.readPreferences();
  assert.equal(prefs.scrollUpToPause, true);
});

test("parseClientOptionCommand persists preference", async (t) => {
  const win = await setupWindow(t, "https://example.com/", "Chrome/78");
  const saved = [];
  const { clientOptions } = await import("../../src/client/pages/client-options.js");
  const origSave = clientOptions.save;
  clientOptions.save = (key, val) => saved.push({ key, val });
  t.after(() => {
    clientOptions.save = origSave;
  });
  win.dome.buffer = { append() {} };
  win.dome.scrollBuffer = () => {};
  win.dome.preferences = win.dome.readPreferences();
  win.dome.parseClientOptionCommand("@client-option localEcho true");
  assert.deepEqual(saved[0], { key: "localecho", val: true });
  assert.equal(win.dome.preferences.localEcho, true);
});


test("parseClientOptionCommand sets overlay classes", async (t) => {
  const win = await setupWindow(t, "https://example.com/", "Chrome/78");
  const { clientOptions } = await import("../../src/client/pages/client-options.js");
  const origSave = clientOptions.save;
  clientOptions.save = () => {};
  t.after(() => {
    clientOptions.save = origSave;
  });
  const ac = win.document.createElement("div");
  ac.className = "ui-autocomplete ui-opaque-overlay";
  const secondAc = win.document.createElement("div");
  secondAc.className = "ui-autocomplete ui-opaque-overlay";
  const shortcuts = win.document.createElement("div");
  shortcuts.id = "shortcuts-overlay";
  const historySearch = win.document.createElement("div");
  historySearch.id = "history-search-overlay";
  const clientOptionsOverlay = win.document.createElement("div");
  clientOptionsOverlay.id = "client-options-overlay";
  const gameHealthDetail = win.document.createElement("div");
  gameHealthDetail.id = "gameHealthDetail";
  win.document.body.appendChild(ac);
  win.document.body.appendChild(secondAc);
  win.document.body.appendChild(shortcuts);
  win.document.body.appendChild(historySearch);
  win.document.body.appendChild(clientOptionsOverlay);
  win.document.body.appendChild(gameHealthDetail);
  win.dome.buffer = { append() {} };
  win.dome.scrollBuffer = () => {};
  win.dome.preferences = win.dome.readPreferences();
  win.dome.preferences.transparentOverlay = false;
  win.dome.parseClientOptionCommand("@client-option transparentOverlay true");
  assert.equal(ac.classList.contains("ui-transparent-overlay"), true);
  assert.equal(ac.classList.contains("ui-opaque-overlay"), false);
  assert.equal(secondAc.classList.contains("ui-transparent-overlay"), true);
  assert.equal(secondAc.classList.contains("ui-opaque-overlay"), false);
  assert.equal(shortcuts.classList.contains("ui-transparent-overlay"), true);
  assert.equal(historySearch.classList.contains("ui-transparent-overlay"), true);
  assert.equal(clientOptionsOverlay.classList.contains("ui-transparent-overlay"), true);
  assert.equal(gameHealthDetail.classList.contains("ui-transparent-overlay"), true);
  win.dome.parseClientOptionCommand("@client-option transparentOverlay false");
  assert.equal(ac.classList.contains("ui-transparent-overlay"), false);
  assert.equal(ac.classList.contains("ui-opaque-overlay"), true);
  assert.equal(secondAc.classList.contains("ui-transparent-overlay"), false);
  assert.equal(secondAc.classList.contains("ui-opaque-overlay"), true);
  assert.equal(shortcuts.classList.contains("ui-opaque-overlay"), true);
  assert.equal(historySearch.classList.contains("ui-opaque-overlay"), true);
  assert.equal(clientOptionsOverlay.classList.contains("ui-opaque-overlay"), true);
  assert.equal(gameHealthDetail.classList.contains("ui-opaque-overlay"), true);
});

test("parseClientOptionCommand reapplies overlay classes after autocomplete rebuild", async (t) => {
  const win = await setupWindow(t, "https://example.com/", "Chrome/78");
  const { clientOptions } = await import("../../src/client/pages/client-options.js");
  const origSave = clientOptions.save;
  clientOptions.save = () => {};
  t.after(() => {
    clientOptions.save = origSave;
  });
  let destroyed = false;
  win.dome.buffer = { append() {} };
  win.dome.scrollBuffer = () => {};
  win.dome.inputReader = {
    commandSuggestions(arg) {
      if (arg === "destroy") destroyed = true;
    }
  };
  win.dome.userType = "p";
  win.dome.preferences = win.dome.readPreferences();
  win.dome.preferences.transparentOverlay = false;
  win.dome.preferences.commandSuggestions = true;
  win.dome.preferences.broadSearch = true;
  win.dome.autoComplete = () => {};
  win.dome.setupAutoComplete = () => Promise.resolve().then(() => {
    const ac = win.document.createElement("div");
    ac.className = "ui-autocomplete ui-transparent-overlay";
    win.document.body.appendChild(ac);
  });

  win.dome.parseClientOptionCommand("@client-option broadSearch false");
  await Promise.resolve();
  await Promise.resolve();

  const ac = win.document.querySelector(".ui-autocomplete");
  assert.equal(destroyed, true);
  assert.ok(ac);
  assert.equal(ac.classList.contains("ui-transparent-overlay"), false);
  assert.equal(ac.classList.contains("ui-opaque-overlay"), true);
});

test("@client-option pb accepts numeric values", async (t) => {
  const win = await setupWindow(t, "https://example.com/", "Chrome/78");
  const output = [];
  win.dome.buffer = { append: (text) => output.push(text) };
  win.dome.scrollBuffer = () => {};
  win.dome.preferences = win.dome.readPreferences();
  win.dome.parseClientOptionCommand("@client-option pb 100");
  assert.equal(win.dome.preferences.performanceBuffer, 100);
  assert.ok(output.some((line) => line.includes("changing @client-option performanceBuffer to 100")));
});

test("parseClientOptionCommand refreshes autoscroll when scrollUpToPause changes", async (t) => {
  const win = await setupWindow(t, "https://example.com/", "Chrome/78");
  let setupCount = 0;
  win.dome.buffer = { append() {} };
  win.dome.scrollBuffer = () => {};
  win.dome.setupAutoscroll = () => {
    setupCount++;
  };
  win.dome.preferences = win.dome.readPreferences();
  win.dome.parseClientOptionCommand("@client-option scrollUpToPause true");
  assert.equal(win.dome.preferences.scrollUpToPause, true);
  assert.equal(setupCount, 1);
});
