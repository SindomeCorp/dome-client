import { CONTEXT_MENUS_KEY, defaultContextMenus, validateContextMenus, interpolateCommand } from "../../../shared/context-menus.js";
import { createContextMatcher } from "./worker.js";
import { bindContextOutput } from "./output.js";

export function setupContextMenus({ client, doc = document, win = window, matcherFactory = createContextMatcher } = {}) {
  if (client?.contextMenus) return client.contextMenus;
  let config = defaultContextMenus();
  let snapshot = validateContextMenus(config);
  let matcher;
  let revision = 0;
  let reloadId = 0;
  let server = null;
  let session = 0;
  let connection = 0;
  let prefs = { override: false, profile: "player", fallback: "player" };
  let noticeTimer;
  const bindings = new Map();
  const subscribers = new Set();
  const uiBindings = [];
  function bindUI(target, type, handler) {
    target?.addEventListener(type, handler);
    if (target) uiBindings.push(() => target.removeEventListener(type, handler));
  }
  const select = (id) => snapshot.profiles.get(id);
  const active = () => {
    if (prefs.override && select(prefs.profile)) return { profile: select(prefs.profile), source: "Override" };
    if (select(server)) return { profile: select(server), source: "selected by server" };
    return { profile: select(prefs.fallback) || snapshot.profiles.values().next().value, source: "Fallback" };
  };
  let previous = active().profile.id;
  function report(message) {
    const error = doc.querySelector("#context-menu-error");
    if (error) error.textContent = message;
    client?.health?.showStatus(message);
  }
  function savePreferences() {
    try { win.localStorage.setItem(CONTEXT_MENUS_KEY + "-preferences", JSON.stringify(prefs)); }
    catch { report("Context menu preferences could not be saved in this browser."); }
  }
  function refresh() {
    const state = active();
    const label = doc.querySelector("#context-menu-active");
    if (label) label.textContent = "Active profile: " + state.profile.label + " (" + state.source + ")";
    const override = doc.querySelector("#context-menu-override");
    if (override) override.checked = prefs.override;
    for (const [selector, key] of [["#context-menu-profile", "profile"], ["#context-menu-fallback", "fallback"]]) {
      const dropdown = doc.querySelector(selector);
      if (!dropdown) continue;
      dropdown.replaceChildren(...[...snapshot.profiles.values()].map((profile) => {
        const option = doc.createElement("option");
        option.value = profile.id;
        option.textContent = profile.label;
        return option;
      }));
      dropdown.value = select(prefs[key]) ? prefs[key] : state.profile.id;
      dropdown.disabled = key === "profile" && !prefs.override;
    }
    if (state.profile.id !== previous) {
      const notice = doc.querySelector("#context-menu-notice");
      if (notice) {
        win.clearTimeout(noticeTimer);
        notice.textContent = "Switched to " + state.profile.label + " context menus.";
        notice.hidden = false;
        noticeTimer = win.setTimeout(() => { notice.textContent = ""; }, 4000);
      }
    }
    previous = state.profile.id;
    for (const subscriber of subscribers) subscriber();
  }
  function update(patch) {
    prefs = { ...prefs, ...patch };
    savePreferences();
    refresh();
  }
  async function reload(text, { persist = true } = {}) {
    const request = ++reloadId;
    let candidate;
    try {
      if (text.length > 262144) throw new Error("Configuration exceeds 256 KiB.");
      const parsed = JSON.parse(text);
      const checked = validateContextMenus(parsed);
      candidate = matcherFactory();
      await candidate.request("configure", { config: parsed });
      if (request !== reloadId) { candidate.destroy(); return false; }
      const old = matcher;
      matcher = candidate;
      config = parsed;
      snapshot = checked;
      revision++;
      old?.destroy();
      let warning = "";
      if (!select(prefs.profile)) {
        if (prefs.override) warning = "Override profile is no longer registered; override was disabled.";
        prefs.override = false;
        prefs.profile = snapshot.profiles.keys().next().value;
      }
      if (!select(prefs.fallback)) prefs.fallback = snapshot.profiles.keys().next().value;
      if (!select(server)) server = null;
      if (persist) {
        try { win.localStorage.setItem(CONTEXT_MENUS_KEY, JSON.stringify(config)); }
        catch { report("Rules loaded for this session, but browser storage failed."); refresh(); return true; }
        savePreferences();
      }
      report(warning);
      refresh();
      return true;
    } catch (error) {
      candidate?.destroy();
      if (request === reloadId) report(error.message + " Previous valid context menus remain active.");
      return false;
    }
  }
  const controller = {
    active, reload, report, update,
    get config() { return config; },
    get snapshot() { return snapshot; },
    get revision() { return revision; },
    get session() { return session; },
    get connection() { return connection; },
    get preferences() { return { ...prefs }; },
    subscribe(callback) { subscribers.add(callback); return () => subscribers.delete(callback); },
    async match(text) {
      if (!matcher) return [];
      if (text.length > 32768) throw new Error("Context line exceeds 32768 characters; native menus remain available.");
      return matcher.request("match", { text, profile: active().profile.id });
    },
    setServerProfile(id) {
      server = typeof id === "string" && select(id) ? id : null;
      if (!server) report("Unknown or invalid server context profile; using Options selection.");
      refresh();
    },
    resetSession({ transport = true } = {}) {
      session++;
      if (transport) { connection++; client?.resetOutputProtocol?.(); }
      server = null;
      refresh();
    },
    bindOutput(element, host) {
      if (!element || bindings.has(element)) return;
      const binding = bindContextOutput({ controller, client, element, win: host });
      bindings.set(element, binding);
      return () => { binding(); bindings.delete(element); };
    },
    activate(action, context) {
      if (context.session !== session || context.revision !== revision || context.profile !== active().profile.id) throw new Error("Context changed; open the menu again.");
      if (action.type === "game-command") {
        if (context.kind !== "token") throw new Error("Selections cannot be used in commands.");
        if (client?.socketState !== 1 || !client.socket?.emit) throw new Error("Connect before sending a context command.");
        const rule = snapshot.rules.get(context.match.rule);
        client.socket.emit("input", interpolateCommand(action, rule, context.match.values));
      } else if (action.action === "clipboard.copy") {
        return context.doc.defaultView.navigator.clipboard.writeText(context.text);
      } else if (action.action === "ide.open-scratch") {
        if (!client?.openIDE) throw new Error("The IDE is not available here.");
        return client.openIDE({ contextScratch: true, buffer: context.text });
      }
    },
    destroy() { reloadId++; matcher?.destroy(); for (const dispose of bindings.values()) dispose(); bindings.clear(); subscribers.clear(); uiBindings.splice(0).forEach((remove) => remove()); win.clearTimeout(noticeTimer); }
  };
  if (client) client.contextMenus = controller;
  const editor = doc.querySelector("#context-menu-json");
  let saved;
  try {
    saved = win.localStorage.getItem(CONTEXT_MENUS_KEY);
    const stored = JSON.parse(win.localStorage.getItem(CONTEXT_MENUS_KEY + "-preferences") || "null");
    if (stored) prefs = { override: stored.override === true, profile: typeof stored.profile === "string" ? stored.profile : "player", fallback: typeof stored.fallback === "string" ? stored.fallback : "player" };
  } catch { report("Unable to read saved context menus."); }
  if (editor) editor.value = saved || JSON.stringify(config, null, 2);
  bindUI(doc.querySelector("#context-menu-override"), "change", (event) => update({ override: event.target.checked }));
  bindUI(doc.querySelector("#context-menu-profile"), "change", (event) => update({ profile: event.target.value }));
  bindUI(doc.querySelector("#context-menu-fallback"), "change", (event) => update({ fallback: event.target.value }));
  bindUI(doc.querySelector("#context-menu-reload"), "click", () => reload(editor.value));
  const fileInput = doc.querySelector("#context-menu-file");
  bindUI(fileInput, "change", async () => {
    const file = fileInput.files?.[0];
    try {
      if (file) {
        if (file.size > 262144) throw new Error("Configuration exceeds 256 KiB.");
        editor.value = await file.text();
        await reload(editor.value);
      }
    } catch (error) { report(error.message + " Previous valid context menus remain active."); }
    fileInput.value = "";
  });
  bindUI(doc.querySelector("#context-menu-export"), "click", () => {
    const url = win.URL.createObjectURL(new win.Blob([JSON.stringify(config, null, 2)], { type: "application/json" }));
    const link = doc.createElement("a");
    link.href = url;
    link.download = "context-menus.json";
    link.click();
    win.URL.revokeObjectURL(url);
  });
  refresh();
  controller.ready = reload(saved || JSON.stringify(config), { persist: false }).then(async (ok) => {
    if (!ok && saved) {
      const message = doc.querySelector("#context-menu-error")?.textContent;
      await reload(JSON.stringify(defaultContextMenus()), { persist: false });
      report(message || "Saved configuration failed; shipped rules are active.");
    }
  });
  for (const view of Object.values(client?.outputWindows?.views || {})) view.disposeContextMenus = controller.bindOutput(view.element, view.win);
  if (client?.buffer && !client.outputWindows) controller.bindOutput(client.buffer, win);
  return controller;
}
