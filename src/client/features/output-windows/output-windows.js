import { store } from "../../core/store.js";
import { logger as defaultLogger } from "../../core/constants.js";
import { normalizeOutputWindows, outputWindowDefaults, OUTPUT_WINDOWS_STORAGE_KEY } from "../../../shared/output-windows.js";
import { OutputHistory, recordText, splitRunsIntoLines } from "./history.js";
import { VirtualOutputView } from "./virtual-view.js";
import { createRuleRunner } from "./rule-runner.js";
import { abortable, createInputQueue } from "./work-queue.js";
import { setupOutputOptions } from "./options-ui.js";
import { setupHistoryTools } from "./history-tools.js";
import { showClientOptionsSaved } from "../options/client-options-toast.js";

export class OutputWindows {
  constructor({ client, doc, win, storage = store, logger = defaultLogger, config = win.__OUTPUT_WINDOWS__ || {}, workerFactory }) {
    Object.assign(this, { client, doc, win, storage, logger });
    this.config = { enabled: config.enabled !== false, customRegexEnabled: config.customRegexEnabled !== false, presets: config.presets || [] };
    this.settings = normalizeOutputWindows(storage.get(OUTPUT_WINDOWS_STORAGE_KEY)).value;
    this.history = new OutputHistory();
    this.generation = 1;
    this.committed = this.indexed = 0;
    this.reindexBoundary = 0;
    this.pending = new Set();
    this.routing = new Map();
    this.activePanel = "main";
    this.activeRows = {};
    this.indexWaiters = [];
    this.workspace = doc.querySelector("#output-workspace");
    client.outputWindows = this;
    this.inputQueue = createInputQueue({ now: () => win.performance.now(), onError: (error) => logger.error("Output processing failed.", error) });
    this.runner = createRuleRunner({
      workerFactory,
      onError: (message) => {
        this.report(message);
        this.options?.refresh();
      }
    });
    this.views = {};
    for (const name of ["main", "secondary"]) {
      this.views[name] = new VirtualOutputView({
        element: doc.querySelector(name === "main" ? "#lineBuffer" : "#secondaryBuffer"), client, win, name,
        onActive: (panel) => { this.activePanel = panel; this.updatePauseButton(); },
        onRow: (id, panel) => { this.activeRows[panel] = id; },
        onState: (view) => this.updateViewState(view),
        onMessage: (message) => this.report(message)
      });
    }
    this.options = setupOutputOptions(this);
    this.tools = setupHistoryTools(this);
    this.refreshRules();
    this.bindControls();
    this.applyLayout();
    this.refreshPresentation();
  }

  report(message) {
    this.client.health?.showStatus(message);
    const error = this.doc.querySelector("#output-rule-error");
    if (error && /rule|routing/i.test(message)) error.textContent = message;
    const status = this.doc.querySelector("#output-announcements");
    if (status) status.textContent = message;
  }

  isSplitOpen() { return this.config.enabled && this.settings.open; }
  routeState() { return { open: this.isSplitOpen(), generation: this.generation, rules: this.rules }; }
  panelFor(record, state = this.routeState()) {
    return state.open && record.generation === state.generation && record.secondary ? "secondary" : "main";
  }

  refreshRules() {
    const custom = this.config.customRegexEnabled ? this.settings.custom : [];
    const selected = new Set(this.settings.selected);
    this.rules = this.config.enabled ? [...this.config.presets, ...custom].filter((rule) => selected.has(rule.id)) : [];
  }

  updateSettings(patch) {
    const wasOpen = this.isSplitOpen();
    this.settings = normalizeOutputWindows({ ...this.settings, ...patch }).value;
    this.storage.put(OUTPUT_WINDOWS_STORAGE_KEY, this.settings);
    showClientOptionsSaved(this.doc);
    if (Object.hasOwn(patch, "selected") || Object.hasOwn(patch, "custom")) {
      this.refreshRules();
      this.runner.reset();
    }
    if (wasOpen !== this.isSplitOpen()) {
      // Old routing generations stay in main when a split is reopened.
      this.generation++;
      this.reindex();
    }
    this.applyLayout();
    this.options.refresh();
    this.tools.changed({ routing: wasOpen !== this.isSplitOpen() });
  }

  importSettings(value) {
    const normalized = normalizeOutputWindows(value);
    if (normalized.valid && !this.config.customRegexEnabled) {
      normalized.skipped += normalized.value.custom.length;
      normalized.value.custom = this.settings.custom;
      normalized.value.selected = normalized.value.selected.filter((id) => !id.startsWith("custom-"))
        .concat(this.settings.selected.filter((id) => id.startsWith("custom-")));
    }
    if (normalized.valid) this.updateSettings(normalized.value);
    return normalized;
  }

  resetSettings() { this.updateSettings(outputWindowDefaults()); }

  withContext(context, callback) {
    const previous = this.context;
    this.context = context;
    try { return callback(); }
    finally { this.context = previous; }
  }

  startBlock() {
    if (!this.group) this.group = { id: this.history.next, scrollLeft: 0 };
  }
  endBlock() { this.group = null; }

  appendRuns(runs, { local = false, echo = false } = {}) {
    if (this.group?.discarded && !local) return;
    const context = this.context || this.routeState();
    const shouldRoute = !local && !this.group && context.open && context.rules?.length;
    const records = splitRunsIntoLines(runs).map((line) => this.history.append(line, {
      group: local ? null : this.group, generation: context.generation, ready: !shouldRoute, echo
    }));
    if (!records.length) return;
    this.announcement = ((this.announcement || "") + records.slice(-20).map(recordText).join("\n")).slice(-1500);
    if (shouldRoute) {
      const epoch = this.history.epoch;
      const first = records[0].id;
      const last = records.at(-1).id;
      const controller = new AbortController();
      this.routing.set(controller, last);
      // Retain IDs rather than record arrays: pruning must release old output
      // even while a worker is busy with an earlier batch.
      const job = this.runner.match(records.map(recordText), context.rules, { signal: controller.signal }).then((matches) => {
        if (epoch !== this.history.epoch) return;
        for (let id = Math.max(first, this.history.first); id <= last; id++) {
          const record = this.history.get(id);
          record.secondary = matches[id - first] === true;
          record.ready = true;
        }
        this.commitReady();
      }).finally(() => { this.pending.delete(job); this.routing.delete(controller); });
      this.pending.add(job);
    }
    this.prune();
    this.commitReady();
  }

  appendLocal(text, { echo = false } = {}) {
    this.inputQueue.task(() => this.appendRuns([{ text: String(text), classes: [], inlineStyles: [] }], { local: true, echo }));
  }

  commitReady() {
    this.committed = Math.max(this.committed, this.history.first - 1);
    const start = this.win.performance.now();
    while (this.committed < this.history.next - 1 && this.history.get(this.committed + 1)?.ready) {
      this.committed++;
      if (this.committed % 64 === 0 && this.win.performance.now() - start > 8) {
        if (!this.commitTimer) this.commitTimer = this.win.setTimeout(() => { this.commitTimer = null; this.commitReady(); }, 0);
        break;
      }
    }
    this.scheduleIndex();
  }

  scheduleIndex() {
    if (this.indexTimer) return;
    this.indexTimer = this.win.setTimeout(() => {
      this.indexTimer = null;
      this.indexed = Math.max(this.indexed, this.history.first - 1);
      const start = this.win.performance.now();
      while (this.indexed < this.committed) {
        const record = this.history.get(++this.indexed);
        if (record) {
          const name = this.panelFor(record);
          this.views[name].append(record, record.id > this.reindexBoundary);
        }
        if (this.indexed % 64 === 0 && this.win.performance.now() - start >= 8) break;
      }
      this.updateHelp();
      this.tools.changed();
      if (this.announcement) {
        this.doc.querySelector("#output-announcements").textContent = this.announcement;
        this.announcement = "";
      }
      if (this.indexed < this.committed) this.scheduleIndex();
      else this.indexWaiters.splice(0).forEach((resolve) => resolve());
    }, 0);
  }

  whenIndexed() {
    return this.indexed >= this.committed ? Promise.resolve() : new Promise((resolve) => this.indexWaiters.push(resolve));
  }

  async snapshot(signal, first) {
    const boundary = await abortable(new Promise((resolve) => this.inputQueue.task(() => resolve(this.history.snapshot(undefined, first)))), signal);
    await abortable(Promise.all([...this.pending]), signal);
    signal?.throwIfAborted();
    return boundary;
  }

  async idle() {
    await this.inputQueue.idle();
    await Promise.all([...this.pending]);
    this.commitReady();
    await this.whenIndexed();
  }

  prune() {
    const removed = this.history.prune(this.client.preferences.performanceBuffer);
    if (!removed) return;
    for (const [controller, last] of this.routing) {
      if (last >= this.history.first) break;
      controller.abort();
      this.routing.delete(controller);
    }
    for (const view of Object.values(this.views)) view.prune(this.history.first);
    this.tools.changed();
  }

  reindex() {
    this.reindexBoundary = this.committed;
    this.indexed = this.history.first - 1;
    for (const view of Object.values(this.views)) {
      const anchor = view.anchor;
      const following = view.following;
      view.reset();
      const record = anchor && this.history.get(anchor.id);
      view.anchor = record && this.panelFor(record) === view.name ? anchor : null;
      if (view.anchor) view.following = following;
      view.pendingJump = Boolean(view.anchor);
    }
    this.scheduleIndex();
  }

  clear() {
    this.inputQueue.clear();
    this.runner.cancel();
    this.pending.clear();
    this.routing.clear();
    this.history.clear();
    this.committed = this.indexed = this.history.first - 1;
    this.group = null;
    this.announcement = "";
    this.activeRows = {};
    for (const view of Object.values(this.views)) view.reset();
    this.tools.changed({ reset: true });
    this.updateHelp();
  }

  updateViewState(view) {
    const button = this.doc.querySelector("[data-output-pause=" + view.name + "]");
    if (button) {
      button.textContent = view.paused ? "Resume" : "Pause";
      button.setAttribute("aria-label", (view.paused ? "Resume " : "Pause ") + view.name + " scrolling");
    }
    const unread = this.doc.querySelector("[data-output-unread=" + view.name + "]");
    if (unread) unread.textContent = view.unread ? view.unread + " unread" : "";
    this.updatePauseButton();
  }

  updatePauseButton() {
    const button = this.client.scrollButton;
    const view = this.views?.[this.activePanel];
    if (!button || !view) return;
    button.textContent = view.paused ? "RESUME SCROLL" : "PAUSE SCROLL";
    button.classList.toggle("btn-danger", view.paused);
    button.setAttribute("title", (view.paused ? "Resume " : "Pause ") + this.activePanel + " output scrolling");
    this.client.pauseBuffer = view.paused;
  }

  togglePause() {
    const view = this.views[this.isSplitOpen() ? this.activePanel : "main"];
    view.setPaused(!view.paused);
  }

  refreshPresentation() {
    const primary = this.client.buffer;
    for (const [name, view] of Object.entries(this.views)) {
      if (name !== "main") view.element.className = primary.className;
      view.element.classList.toggle("scroll-disabled", view.paused);
      view.element.style.fontSize = primary.style.fontSize;
      view.refreshPresentation();
    }
    this.prune();
  }

  updateHelp() {
    const help = this.doc.querySelector("#output-secondary-help");
    help.classList.toggle("hide", this.views.secondary.index.length > 0);
    help.querySelector("p").textContent = this.rules?.length
      ? "Waiting for matching output."
      : "Send output to this window by opening Options → Output Windows and selecting output filters.";
    help.querySelector("button").classList.toggle("hide", Boolean(this.rules?.length));
  }

  applyLayout() {
    const open = this.isSplitOpen();
    this.workspace.classList.toggle("split-open", open);
    this.workspace.dataset.position = this.settings.position;
    this.workspace.style.setProperty("--secondary-size", this.settings.secondarySize + "%");
    this.doc.querySelector("#output-secondary-panel").classList.toggle("hide", !open);
    const divider = this.doc.querySelector("#output-divider");
    divider.classList.toggle("hide", !open);
    divider.setAttribute("aria-orientation", ["left", "right"].includes(this.settings.position) ? "vertical" : "horizontal");
    divider.setAttribute("aria-valuenow", Math.round(this.settings.secondarySize));
    const button = this.doc.querySelector("#button-output-split");
    button?.classList.toggle("hide", !this.config.enabled);
    button?.setAttribute("aria-expanded", String(open));
    if (button) button.textContent = open ? "CLOSE SPLIT" : "SPLIT";
    if (!open) this.activePanel = "main";
    for (const view of Object.values(this.views)) view.schedule();
    this.updateHelp();
  }

  bindControls() {
    for (const name of ["main", "secondary"]) {
      const header = this.doc.querySelector("#output-" + name + "-panel header");
      const activate = () => { this.activePanel = name; this.updatePauseButton(); };
      header.addEventListener("focusin", activate);
      header.addEventListener("pointerdown", activate);
    }
    this.doc.querySelector("#button-output-split")?.addEventListener("click", () => this.updateSettings({ open: !this.isSplitOpen() }));
    this.doc.querySelector("#button-output-close").addEventListener("click", () => this.updateSettings({ open: false }));
    this.doc.querySelector("#button-output-configure").addEventListener("click", () => {
      this.client.clientOptionsOverlay.classList.remove("hide");
      this.doc.querySelector("#client-options-tab-output")?.click();
    });
    this.doc.querySelectorAll("[data-output-pause]").forEach((button) => {
      button.addEventListener("click", () => {
        const view = this.views[button.dataset.outputPause];
        this.activePanel = view.name;
        view.setPaused(!view.paused);
      });
    });
    const divider = this.doc.querySelector("#output-divider");
    let dragging = false;
    let frame;
    let pendingSize;
    const changeSize = () => {
      frame = null;
      this.settings.secondarySize = Math.max(15, Math.min(85, pendingSize));
      this.workspace.style.setProperty("--secondary-size", this.settings.secondarySize + "%");
      divider.setAttribute("aria-valuenow", Math.round(this.settings.secondarySize));
    };
    divider.addEventListener("pointerdown", (event) => {
      dragging = true;
      divider.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    divider.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const rect = this.workspace.getBoundingClientRect();
      const horizontal = ["left", "right"].includes(this.settings.position);
      const fraction = horizontal ? (event.clientX - rect.left) / rect.width : (event.clientY - rect.top) / rect.height;
      pendingSize = (["left", "top"].includes(this.settings.position) ? fraction : 1 - fraction) * 100;
      if (frame == null) frame = this.win.requestAnimationFrame(changeSize);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      divider.addEventListener(type, () => {
        if (!dragging) return;
        dragging = false;
        if (frame != null) { this.win.cancelAnimationFrame(frame); changeSize(); }
        this.updateSettings({ secondarySize: this.settings.secondarySize });
      });
    }
    divider.addEventListener("keydown", (event) => {
      let size = this.settings.secondarySize;
      if (["ArrowRight", "ArrowUp"].includes(event.key)) size += 2;
      else if (["ArrowLeft", "ArrowDown"].includes(event.key)) size -= 2;
      else if (event.key === "Home") size = 15;
      else if (event.key === "End") size = 85;
      else return;
      event.preventDefault();
      this.updateSettings({ secondarySize: size });
    });
  }

  destroy() {
    this.clear();
    this.tools.cancel();
    this.win.clearTimeout(this.indexTimer);
    this.win.clearTimeout(this.commitTimer);
    for (const view of Object.values(this.views)) view.destroy();
  }
}

export function setupOutputWindows({ client, doc, win, ...options }) {
  if (!doc.querySelector("#output-workspace")) return;
  return new OutputWindows({ client, doc, win, ...options });
}
