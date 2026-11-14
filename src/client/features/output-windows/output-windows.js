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
import { setScrollButtonUi } from "../terminal/autoscroll.js";
import { setupOutputToolbar } from "./toolbar.js";
import { setupOutputPopout } from "./popout.js";
import { FONT_CHOICES, COLORSET_CHOICES, getOutputPresentation } from "../../../shared/client-options.js";

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
        onState: (view) => this.updateViewState(view),
        onMessage: (message) => this.report(message)
      });
    }
    this.options = setupOutputOptions(this);
    this.tools = setupHistoryTools(this);
    this.refreshRules();
    this.bindControls();
    this.toolbar = setupOutputToolbar(this);
    this.popout = setupOutputPopout(this);
    this.popout.refresh();
    this.applyLayout();
    this.refreshPresentation();
  }

  report(message) {
    this.client.health?.showStatus(message);
    const error = this.doc.querySelector("#output-rule-error");
    if (error && /rule|routing/i.test(message)) error.textContent = message;
    const status = this.doc.querySelector("#output-announcements");
    if (status) status.textContent = message;
    const companionStatus = this.views.secondary.element.ownerDocument !== this.doc
      && this.views.secondary.element.ownerDocument.querySelector("#output-popout-status");
    if (companionStatus) companionStatus.textContent = message;
  }

  isSplitOpen() { return this.config.enabled && this.settings.open; }
  routeState() { return { open: this.isSplitOpen(), generation: this.generation, rules: this.rules }; }
  panelFor(record, state = this.routeState()) {
    const route = record.group || record;
    return state.open && route.generation === state.generation && route.secondary ? "secondary" : "main";
  }

  refreshRules() {
    const custom = this.config.customRegexEnabled ? this.settings.custom : [];
    const selected = new Set(this.settings.selected);
    this.rules = this.config.enabled ? [...this.config.presets, ...custom].filter((rule) => selected.has(rule.id)) : [];
  }

  updateSettings(patch) {
    if (patch.open === false || Object.hasOwn(patch, "position")) this.popout?.redock({ focus: false });
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
    if (this.group) return;
    const context = this.context || this.routeState();
    const rules = context.open ? context.rules : [];
    this.group = {
      id: this.history.next, scrollLeft: 0, generation: context.generation,
      secondary: false, ready: !rules?.length, routingRules: rules
    };
  }
  endBlock() {
    if (this.group?.routingRules) {
      // An empty/blank-only block has no line to test. Release it to main.
      this.group.ready = true;
      delete this.group.routingRules;
    }
    this.group = null;
    this.commitReady();
  }

  routeBlock(group, record) {
    const rules = group.routingRules;
    delete group.routingRules;
    const epoch = this.history.epoch;
    const controller = new AbortController();
    this.routing.set(controller, record.id);
    // One decision lives on the shared group. Later rows stream using it;
    // resolving a large block never needs to visit its accumulated records.
    const job = this.runner.match([recordText(record)], rules, { signal: controller.signal }).then((matches) => {
      if (epoch !== this.history.epoch) return;
      group.secondary = matches[0] === true;
      group.ready = true;
      this.commitReady();
    }).finally(() => { this.pending.delete(job); this.routing.delete(controller); });
    this.pending.add(job);
  }

  appendRuns(runs, { local = false, echo = false } = {}) {
    this.popout?.check();
    if (this.group?.discarded && !local) return;
    const context = this.context || this.routeState();
    const group = local ? null : this.group;
    const shouldRoute = !local && !this.group && context.open && context.rules?.length;
    const records = splitRunsIntoLines(runs).map((line) => this.history.append(line, {
      group, generation: group?.generation ?? context.generation, ready: group ? group.ready : !shouldRoute, echo
    }));
    if (!records.length) return;
    this.announcement = ((this.announcement || "") + records.slice(-20).map(recordText).join("\n")).slice(-1500);
    if (group?.routingRules?.length) {
      const firstContent = records.find((record) => recordText(record).trim().length > 0);
      if (firstContent) this.routeBlock(group, firstContent);
    }
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
    while (this.committed < this.history.next - 1) {
      const record = this.history.get(this.committed + 1);
      if (!(record?.group ? record.group.ready : record?.ready)) break;
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
      this.popout?.changed();
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

  async snapshot(signal, first, last) {
    const boundary = await abortable(new Promise((resolve) => this.inputQueue.task(() => resolve(this.history.snapshot(last, first)))), signal);
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
    this.popout?.changed();
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
    for (const view of Object.values(this.views)) view.reset();
    this.tools.changed({ reset: true });
    this.popout?.changed({ reset: true });
    this.updateHelp();
  }

  updateViewState(view) {
    const host = view.element.ownerDocument;
    const button = host.querySelector("[data-output-pause=" + view.name + "]");
    if (button) {
      setScrollButtonUi(button, view.paused, "pause-label");
      button.setAttribute("aria-label", (view.paused ? "Resume " : "Pause ") + view.name + " scrolling");
    }
    const unread = host.querySelector("[data-output-unread=" + view.name + "]");
    const text = view.unread ? view.unread + " unread" : "";
    if (unread && unread.textContent !== text) {
      const previousLength = unread.textContent.length;
      unread.textContent = text;
      if (view.name === "main" && previousLength !== text.length) this.toolbar?.resize();
    }
    this.updatePauseButton();
  }

  updatePauseButton() {
    const button = this.client.scrollButton;
    const view = this.views?.main;
    if (!button || !view) return;
    setScrollButtonUi(button, view.paused);
    button.setAttribute("aria-label", (view.paused ? "Resume " : "Pause ") + "main scrolling");
    button.setAttribute("title", (view.paused ? "Resume " : "Pause ") + "main output scrolling");
    this.client.pauseBuffer = this.views[this.activePanel]?.paused || false;
  }

  togglePause(panel = this.activePanel) {
    const view = this.views[this.isSplitOpen() ? panel : "main"];
    view.setPaused(!view.paused);
  }

  closeSplit() {
    if (!this.isSplitOpen()) return true;
    if (!this.win.confirm("Close the secondary output window? Its retained output will return to the main window.")) return false;
    this.updateSettings({ open: false });
    return true;
  }

  refreshPresentation() {
    const primary = this.client.buffer;
    const colors = this.win.getComputedStyle(primary);
    this.workspace.style.setProperty("--output-background", colors.backgroundColor);
    this.workspace.style.setProperty("--output-foreground", colors.color);
    for (const [name, view] of Object.entries(this.views)) {
      const presentation = getOutputPresentation(this.client.preferences, name === "secondary");
      if (name !== "main") {
        view.element.className = primary.className;
        view.element.classList.remove(...FONT_CHOICES.map((font) => font + "Text"), ...COLORSET_CHOICES.map((theme) => "colorset-" + theme));
        view.element.classList.add(presentation.font + "Text");
        if (presentation.theme !== "normal") view.element.classList.add("colorset-" + presentation.theme);
        view.element.style.fontSize = presentation.size + "pt";
        const secondaryColors = view.win.getComputedStyle(view.element);
        const panel = view.element.closest(".output-panel");
        panel.style.setProperty("--output-background", secondaryColors.backgroundColor);
        panel.style.setProperty("--output-foreground", secondaryColors.color);
      }
      view.element.classList.toggle("scroll-disabled", view.paused);
      if (name === "secondary" && view.element.ownerDocument !== this.doc) {
        const root = view.element.ownerDocument.querySelector("#browser-client");
        const secondaryColors = view.win.getComputedStyle(view.element);
        root.style.setProperty("--output-background", secondaryColors.backgroundColor);
        root.style.setProperty("--output-foreground", secondaryColors.color);
        root.style.backgroundColor = secondaryColors.backgroundColor;
        root.style.color = secondaryColors.color;
      }
      this.updateViewState(view);
      const signature = JSON.stringify([presentation, this.client.preferences.imagePreview, this.client.preferences.sdwcNowrapBlocks]);
      if (view.presentationSignature !== signature) {
        view.presentationSignature = signature;
        view.refreshPresentation();
      }
    }
    this.prune();
  }

  updateHelp() {
    const help = this.views.secondary.element.ownerDocument.querySelector("#output-secondary-help");
    help.classList.toggle("hide", this.views.secondary.index.length > 0);
    help.querySelector("p").textContent = this.rules?.length
      ? "Waiting for matching output."
      : "Send output to this window by opening Options → Output Windows and selecting output filters.";
    help.querySelector("button").classList.toggle("hide", Boolean(this.rules?.length));
  }

  applyLayout() {
    const open = this.isSplitOpen();
    const detached = this.popout?.isDetached();
    this.workspace.classList.toggle("split-open", open && !detached);
    this.workspace.dataset.position = this.settings.position;
    this.workspace.style.setProperty("--secondary-size", this.settings.secondarySize + "%");
    this.doc.querySelector("#output-secondary-panel").classList.toggle("hide", !open || detached);
    const divider = this.doc.querySelector("#output-divider");
    divider.classList.toggle("hide", !open || detached);
    divider.setAttribute("aria-orientation", ["left", "right"].includes(this.settings.position) ? "vertical" : "horizontal");
    divider.setAttribute("aria-valuenow", Math.round(this.settings.secondarySize));
    const button = this.doc.querySelector("#button-output-split");
    button?.classList.toggle("hide", !this.config.enabled);
    button?.setAttribute("aria-expanded", String(open));
    if (button) button.textContent = detached ? "REDOCK" : open ? "CLOSE SPLIT" : "SPLIT";
    if (!open) this.activePanel = "main";
    this.toolbar?.refresh();
    for (const view of Object.values(this.views)) view.schedule();
    this.updateHelp();
  }

  bindControls() {
    for (const name of ["main", "secondary"]) {
      const header = this.doc.querySelector("#output-" + name + "-panel header");
      const activate = () => { this.activePanel = name; this.updatePauseButton(); };
      header?.addEventListener("focusin", activate);
      header?.addEventListener("pointerdown", activate);
    }
    this.doc.querySelector("#button-output-split")?.addEventListener("click", () => {
      if (this.popout.isDetached()) { this.popout.redock(); return; }
      if (this.isSplitOpen()) this.closeSplit();
      else this.updateSettings({ open: true });
    });
    this.doc.querySelector("#button-output-close").addEventListener("click", () => this.closeSplit());
    this.doc.querySelector("#button-output-configure").addEventListener("click", () => this.configure());
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
    this.popout.destroy();
    this.toolbar.destroy();
    this.clear();
    this.tools.cancel();
    this.win.clearTimeout(this.indexTimer);
    this.win.clearTimeout(this.commitTimer);
    for (const view of Object.values(this.views)) view.destroy();
  }

  configure() {
    this.win.focus();
    this.client.clientOptionsOverlay.classList.remove("hide");
    this.doc.querySelector("#client-options-tab-output")?.click();
  }
}

export function setupOutputWindows({ client, doc, win, ...options }) {
  if (!doc.querySelector("#output-workspace")) return;
  return new OutputWindows({ client, doc, win, ...options });
}
