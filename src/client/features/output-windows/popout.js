import { VirtualOutputView } from "./virtual-view.js";
import { setupHistoryTools } from "./history-tools.js";

export function setupOutputPopout(manager) {
  const { win, doc } = manager;
  let child = null;
  let instance;
  let childDoc;
  let childTools;
  let timer;
  let poll;
  let observer;
  let shuttingDown = false;
  const bindings = [];
  function bind(target, type, handler) {
    target.addEventListener(type, handler);
    bindings.push(() => target.removeEventListener(type, handler));
  }
  const dock = doc.querySelector("#secondaryBuffer");
  const canOpen = () => manager.config.enabled && typeof win.DomeNative?.sendInput !== "function";
  // Keep callbacks outside transfer's scope: its state-copy callback captures
  // the retired renderer, which must not remain reachable through the new one.
  const viewCallbacks = {
    onActive: () => { manager.activePanel = "secondary"; manager.updatePauseButton(); },
    onState: (value) => manager.updateViewState(value),
    onMessage: (message) => report(message)
  };

  function refresh() {
    const detached = Boolean(childDoc);
    doc.querySelector("#button-output-popout")?.classList.toggle("hide", !canOpen());
    const redock = doc.querySelector("#output-options-redock");
    redock?.classList.toggle("hide", !detached);
    const status = doc.querySelector("#output-placement-status");
    if (status) status.textContent = detached ? "Secondary output is popped out." : "";
    manager.applyLayout();
  }

  function transfer(element, host) {
    const previous = manager.views.secondary;
    if (!previous.following && !previous.anchor && previous.index.length) {
      try { previous.captureAnchor(); }
      catch {
        // A navigated document may no longer expose layout APIs. If no scroll
        // anchor was established yet, retain the first available logical row.
        previous.anchor = { id: previous.index.at(0).id, offset: 0 };
      }
    }
    const state = Object.fromEntries(["index", "paused", "following", "unread", "anchor", "highlight"].map((key) => [key, previous[key]]));
    const selection = previous.element.ownerDocument.getSelection();
    if (previous.hasSelection()) {
      selection.removeAllRanges();
      manager.report("The text selection was cleared while transferring the output window.");
    }
    manager.tools.hostChanged();
    try { previous.destroy(); }
    catch (error) { manager.logger.warn("Unable to finish cleanup of the previous output host.", error); }
    const view = new VirtualOutputView({
      element, win: host, client: manager.client, name: "secondary",
      ...viewCallbacks
    });
    Object.assign(view, state);
    view.collapsePreviewsThrough = manager.history.next - 1;
    view.pendingJump = Boolean(view.anchor);
    view.element.classList.toggle("scroll-disabled", view.paused);
    manager.views.secondary = view;
    manager.updateViewState(view);
    view.schedule();
  }

  function report(message) {
    manager.report(message);
    const status = childDoc?.querySelector("#output-popout-status");
    if (status) status.textContent = message;
  }

  function stop() {
    win.clearTimeout(timer);
    win.clearInterval(poll);
    observer?.disconnect();
    observer = null;
    childTools?.cancel();
    childTools = null;
    bindings.splice(0).forEach((remove) => remove());
  }

  function redock({ focus = true } = {}) {
    if (!child) return;
    const closing = child;
    stop();
    try {
      if (childDoc) transfer(dock, win);
    } finally {
      child = null;
      childDoc = null;
      instance = null;
      try { closing.close(); } catch { /* The browser may already have closed it. */ }
    }
    if (!shuttingDown) {
      refresh();
      manager.refreshPresentation();
      if (focus) { win.focus(); manager.client.inputReader?.focus({ preventScroll: true }); }
    }
  }

  function check() {
    if (!child || shuttingDown) return;
    let gone;
    try {
      gone = child.closed || (childDoc && child.document !== childDoc);
    } catch { gone = true; }
    if (gone) redock({ focus: false });
  }

  function facade(host) {
    const model = {
      doc: host.document, win: host, client: manager.client, logger: manager.logger,
      history: manager.history,
      routeState: () => manager.routeState(), panelFor: (...args) => manager.panelFor(...args),
      isSplitOpen: () => manager.isSplitOpen(), snapshot: (...args) => manager.snapshot(...args),
      whenIndexed: () => manager.whenIndexed(), report
    };
    Object.defineProperties(model, {
      views: { get: () => manager.views },
      activePanel: { get: () => manager.activePanel, set: (value) => { manager.activePanel = value; } }
    });
    return model;
  }

  function attach() {
    childDoc = child.document;
    const element = childDoc.querySelector("#secondaryBuffer");
    if (!element) throw new Error("The output window did not load its display.");
    childDoc.title = "Secondary Output — " + (win.gameName || "Webclient");
    childDoc.querySelector("#output-secondary-panel").classList.remove("hide");
    childDoc.querySelector("#output-popout-status").textContent = "";
    const scope = childDoc.querySelector("#output-find-scope");
    scope.value = "secondary";
    scope.closest("label").hidden = true;
    childTools = setupHistoryTools(facade(child));
    bind(childDoc.querySelector("#button-output-redock"), "click", () => redock());
    for (const control of childDoc.querySelectorAll("[data-output-configure], #button-output-configure")) {
      bind(control, "click", () => manager.configure());
    }
    bind(childDoc.querySelector("[data-output-pause]"), "click", () => manager.togglePause("secondary"));
    bind(childDoc, "keydown", (event) => {
      if (event.key === "Pause" && !event.defaultPrevented) { event.preventDefault(); manager.togglePause("secondary"); }
    });
    transfer(element, child);
    const header = childDoc.querySelector("header");
    const resize = () => childDoc.querySelector("#output-workspace").style.setProperty("--secondary-header-height", Math.max(32, header.getBoundingClientRect().height) + "px");
    observer = child.ResizeObserver ? new child.ResizeObserver(resize) : null;
    observer?.observe(header);
    resize();
    manager.refreshPresentation();
    refresh();
  }

  function message(event) {
    if (!child || event.source !== child || event.origin !== win.location.origin || event.data?.instance !== instance) return;
    if (event.data.type === "output-popout-closing") { redock({ focus: false }); return; }
    if (event.data.type !== "output-popout-ready") return;
    if (childDoc) { check(); return; }
    win.clearTimeout(timer);
    try { attach(); }
    catch (error) {
      manager.logger.warn("Unable to attach output pop-out.", error);
      redock({ focus: false });
      manager.report("The pop-out could not load. Secondary output remains docked.");
    }
  }

  function open() {
    check();
    if (child) { child.focus(); return; }
    if (!canOpen() || !manager.isSplitOpen()) return;
    instance = win.crypto?.randomUUID?.() || Date.now() + "-" + Math.random().toString(36).slice(2);
    try {
      child = win.open("/output-window/#instance=" + encodeURIComponent(instance), "dome-output-" + instance, "width=640,height=480,resizable,scrollbars=yes");
    } catch { child = null; }
    if (!child) { manager.report("The browser blocked the pop-out. Allow pop-ups for this site and try again."); return; }
    poll = win.setInterval(check, 1000);
    timer = win.setTimeout(() => {
      redock({ focus: false });
      manager.report("The pop-out did not become ready. Secondary output remains docked.");
    }, 10_000);
  }

  function leave() { shuttingDown = true; redock({ focus: false }); }
  function restore(event) {
    if (event.persisted) { shuttingDown = false; refresh(); }
  }
  win.addEventListener("message", message);
  win.addEventListener("focus", check);
  win.addEventListener("pagehide", leave);
  win.addEventListener("pageshow", restore);
  doc.querySelector("#button-output-popout")?.addEventListener("click", open);
  doc.querySelector("#output-options-redock")?.addEventListener("click", () => redock());
  return {
    open, redock, check, refresh, isDetached: () => Boolean(childDoc),
    changed(change = {}) { childTools?.changed(change); },
    destroy() {
      leave();
      win.removeEventListener("message", message);
      win.removeEventListener("focus", check);
      win.removeEventListener("pagehide", leave);
      win.removeEventListener("pageshow", restore);
    }
  };
}
