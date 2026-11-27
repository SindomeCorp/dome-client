import { CONTEXT_MENUS_KEY, defaultContextMenus, validateContextMenus, interpolateCommand } from "../../../shared/context-menus.js";
import { createContextMatcher } from "./worker.js";
import { bindContextOutput } from "./output.js";
import { supportsContextUnderlines } from "./underlines.js";
import { contextProfileRegistry, loadContextProfiles, mergeContextProfiles } from "../../../shared/context-menu-profiles.js";

export function setupContextMenus({ client, doc = document, win = window, matcherFactory = createContextMatcher, profileLoader = typeof win.fetch === "function" ? (ids) => loadContextProfiles({ fetchFn: win.fetch.bind(win), ids }) : null } = {}) {
  if (win.__CONTEXT_MENUS__?.enabled === false) return null;
  if (client?.contextMenus) return client.contextMenus;
  // Registered files are the baseline; only genuine local JSON overrides them.
  const emptyConfig = () => ({ version: 1, rules: [], profiles: [] });
  let config = profileLoader ? emptyConfig() : defaultContextMenus();
  let snapshot = validateContextMenus(config);
  let matcher;
  let revision = 0;
  let reloadId = 0;
  let pendingUserReload = false;
  let server = null;
  let requestedServer = null;
  let fileProfiles = new Set(profileLoader ? [] : ["player"]);
  let fileDocuments = [];
  let serverRequest = 0;
  let session = 0;
  let connection = 0;
  let prefs = { override: false, profile: "player", underline: false };
  let noticeTimer;
  const bindings = new Map();
  const subscribers = new Set();
  const uiBindings = [];
  function bindUI(target, type, handler) {
    target?.addEventListener(type, handler);
    if (target) uiBindings.push(() => target.removeEventListener(type, handler));
  }
  const select = (id) => snapshot.profiles.get(id);
  const serverChoice = (id) => typeof id === "string" && select(id) && (!Object.hasOwn(contextProfileRegistry, id) || fileProfiles.has(id)) ? id : null;
  const active = () => {
    if (prefs.override && select(prefs.profile)) return { profile: select(prefs.profile), source: "Override" };
    if (select(server)) return { profile: select(server), source: "selected by server" };
    const profile = select("player") || snapshot.profiles.values().next().value || null;
    return { profile, source: profile ? "Fallback" : "Disabled" };
  };
  let previous = active().profile?.id;
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
    if (label) label.textContent = state.profile ? "Active Profile: " + state.profile.label + " (" + state.source + ")" : "Active Profile: Disabled (no profiles available)";
    const override = doc.querySelector("#context-menu-override");
    if (override) override.checked = prefs.override;
    if (override) override.disabled = snapshot.profiles.size === 0;
    const supportsUnderline = supportsContextUnderlines(win);
    const underline = doc.querySelector("#context-menu-underline");
    if (underline) {
      underline.checked = prefs.underline;
      underline.disabled = !supportsUnderline;
      if (supportsUnderline) underline.removeAttribute("aria-describedby");
      else underline.setAttribute("aria-describedby", "context-menu-underline-help");
    }
    doc.querySelector("#context-menu-underline-help")?.classList.toggle("hide", supportsUnderline);
    const dropdown = doc.querySelector("#context-menu-profile");
    if (dropdown) {
      dropdown.replaceChildren(...[...snapshot.profiles.values()].map((profile) => {
        const option = doc.createElement("option");
        option.value = profile.id;
        option.textContent = profile.label;
        return option;
      }));
      dropdown.value = select(prefs.profile) ? prefs.profile : state.profile?.id || "";
      dropdown.disabled = !prefs.override || snapshot.profiles.size === 0;
    }
    if (state.profile?.id !== previous) {
      const notice = doc.querySelector("#context-menu-notice");
      if (notice) {
        win.clearTimeout(noticeTimer);
        notice.textContent = state.profile ? "Switched to " + state.profile.label + " context menus." : "Context menus disabled.";
        notice.hidden = false;
        noticeTimer = win.setTimeout(() => { notice.textContent = ""; }, 4000);
      }
    }
    previous = state.profile?.id;
    for (const subscriber of subscribers) subscriber();
  }
  function update(patch) {
    if (typeof patch.override === "boolean") prefs.override = patch.override;
    if (typeof patch.profile === "string") prefs.profile = patch.profile;
    if (typeof patch.underline === "boolean") prefs.underline = patch.underline;
    savePreferences();
    refresh();
  }
  async function reload(text, { persist = true, allowPartial = false, loadFiles = true, documents, isCurrent = () => true } = {}) {
    const request = ++reloadId;
    if (!documents) pendingUserReload = true;
    let candidate;
    try {
      if (text.length > 262144) throw new Error("Configuration exceeds 256 KiB.");
      const parsed = JSON.parse(text);
      validateContextMenus(parsed);
      let loaded = documents ? { documents, errors: [] } : loadFiles && profileLoader ? await profileLoader() : { documents: [], errors: [] };
      if (allowPartial && loaded.documents.length) {
        const usable = [];
        const errors = [...loaded.errors];
        // Check files independently in bounded workers so one broken file cannot
        // hide the remaining registered profiles during startup recovery.
        for (const document of loaded.documents) {
          const probe = matcherFactory();
          try {
            await probe.request("configure", { config: document.config });
            usable.push(document);
          } catch (error) { errors.push(document.id + ": " + error.message); }
          finally { probe.destroy(); }
          if (request !== reloadId || !isCurrent()) return false;
        }
        loaded = { documents: usable, errors };
      }
      if (request !== reloadId || !isCurrent()) return false;
      if (loaded.errors.length && !allowPartial) throw new Error("Profile files could not load: " + loaded.errors.join("; "));
      const effective = mergeContextProfiles(parsed, loaded.documents);
      const checked = validateContextMenus(effective);
      candidate = matcherFactory();
      await candidate.request("configure", { config: effective });
      if (request !== reloadId || !isCurrent()) { candidate.destroy(); return false; }
      const old = matcher;
      matcher = candidate;
      config = parsed;
      snapshot = checked;
      fileDocuments = loaded.documents;
      fileProfiles = new Set(profileLoader ? loaded.documents.map((document) => document.id) : ["player"]);
      server = serverChoice(requestedServer);
      revision++;
      old?.destroy();
      let warning = loaded.errors.length ? "Unavailable profile files: " + loaded.errors.join("; ") : "";
      if (!select(prefs.profile)) {
        if (prefs.override) warning = "Override profile is no longer registered; override was disabled.";
        prefs.override = false;
        prefs.profile = select("player")?.id || snapshot.profiles.keys().next().value || "player";
      }
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
      if (request === reloadId && isCurrent()) report(error.message + " Previous valid context menus remain active.");
      return false;
    } finally {
      if (!documents && request === reloadId) {
        pendingUserReload = false;
        // OOB may arrive while a reload is pending. Even on rollback, apply its
        // latest recognized choice using the retained, validated snapshot.
        server = serverChoice(requestedServer);
        refresh();
      }
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
      if (!matcher || !active().profile) return [];
      if (text.length > 32768) throw new Error("Context line exceeds 32768 characters; native menus remain available.");
      return matcher.request("match", { text, profile: active().profile.id });
    },
    async setServerProfile(id) {
      const request = ++serverRequest;
      requestedServer = typeof id === "string" ? id : null;
      if (profileLoader && Object.hasOwn(contextProfileRegistry, requestedServer)) {
        if (server !== id) server = null;
        refresh();
        await controller.ready;
        if (pendingUserReload) return;
        const generation = reloadId;
        const selectedSession = session;
        const isCurrent = () => request === serverRequest && selectedSession === session;
        if (!isCurrent()) return;
        try {
          const loaded = await profileLoader([id]);
          if (!isCurrent() || generation !== reloadId) return;
          const document = loaded.documents.find((document) => document.id === id);
          if (!document || loaded.errors.length) throw new Error(loaded.errors.join("; ") || "Missing registered profile file: " + id);
          const previous = fileDocuments.find((document) => document.id === id);
          if (previous && select(id) && JSON.stringify(previous.config) === JSON.stringify(document.config)) {
            fileProfiles.add(id);
            server = serverChoice(id);
            report("");
            refresh();
            return;
          }
          const documents = [...fileDocuments.filter((document) => document.id !== id), document];
          const ok = await reload(JSON.stringify(config), { persist: false, documents, isCurrent });
          if (!isCurrent()) return;
          if (ok) return;
          server = null;
          fileProfiles.delete(id);
        } catch (error) {
          if (!isCurrent()) return;
          server = null;
          fileProfiles.delete(id);
          report("Context profile unavailable; using Options selection. " + error.message);
        }
        refresh();
        return;
      }
      server = serverChoice(requestedServer);
      if (!server) requestedServer = null;
      if (!server) report("Unknown or invalid server context profile; using Options selection.");
      refresh();
    },
    resetSession({ transport = true } = {}) {
      serverRequest++;
      session++;
      if (transport) { connection++; client?.resetOutputProtocol?.(); }
      server = null;
      requestedServer = null;
      refresh();
    },
    bindOutput(element, host) {
      if (!element || bindings.has(element)) return;
      const binding = bindContextOutput({ controller, client, element, win: host });
      bindings.set(element, binding);
      return () => { binding(); bindings.delete(element); };
    },
    activate(action, context) {
      if (!active().profile || context.session !== session || context.revision !== revision || context.profile !== active().profile.id) throw new Error("Context changed; open the menu again.");
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
    destroy() { reloadId++; serverRequest++; matcher?.destroy(); for (const dispose of bindings.values()) dispose(); bindings.clear(); subscribers.clear(); uiBindings.splice(0).forEach((remove) => remove()); win.clearTimeout(noticeTimer); }
  };
  if (client) client.contextMenus = controller;
  const editor = doc.querySelector("#context-menu-json");
  let saved;
  try {
    saved = win.localStorage.getItem(CONTEXT_MENUS_KEY);
    const stored = JSON.parse(win.localStorage.getItem(CONTEXT_MENUS_KEY + "-preferences") || "null");
    if (stored) prefs = { override: stored.override === true, profile: typeof stored.profile === "string" ? stored.profile : "player", underline: stored.underline === true };
  } catch { report("Unable to read saved context menus."); }
  if (editor) editor.value = saved || JSON.stringify(config, null, 2);
  bindUI(doc.querySelector("#context-menu-override"), "change", (event) => update({ override: event.target.checked }));
  bindUI(doc.querySelector("#context-menu-profile"), "change", (event) => update({ profile: event.target.value }));
  bindUI(doc.querySelector("#context-menu-underline"), "change", (event) => update({ underline: event.target.checked }));
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
  const initialRequest = reloadId + 1;
  controller.ready = reload(saved || JSON.stringify(config), { persist: false, allowPartial: true }).then(async (ok) => {
    if (!ok && reloadId === initialRequest) {
      const message = doc.querySelector("#context-menu-error")?.textContent;
      await reload(JSON.stringify(profileLoader ? emptyConfig() : defaultContextMenus()), { persist: false, allowPartial: true });
      report(message || "Saved configuration failed; available shipped rules are active.");
    }
  });
  for (const view of Object.values(client?.outputWindows?.views || {})) view.disposeContextMenus = controller.bindOutput(view.element, view.win);
  if (client?.buffer && !client.outputWindows) controller.bindOutput(client.buffer, win);
  return controller;
}
