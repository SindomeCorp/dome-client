import { store } from "../../core/store.js";
import { logger as defaultLogger } from "../../core/constants.js";
import { createNextSplit, MAX_ADDITIONAL_SPLITS, normalizeOutputWindows, outputWindowDefaults, OUTPUT_WINDOWS_STORAGE_KEY } from "../../../shared/output-windows.js";
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
    this.generations = { secondary: 1 };
    for (const split of this.settings.splits || []) this.generations[split.id] = 1;
    this.panelRules = { secondary: [] };
    this.committed = this.indexed = 0;
    this.reindexBoundary = 0;
    this.pending = new Set();
    this.routing = new Map();
    this.activePanel = "main";
    this.indexWaiters = [];
    this.workspace = doc.querySelector("#output-workspace");
    this.splitStack = doc.querySelector("#output-split-stack") || this.workspace;
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
    this.syncSplitViews();
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
  isSecondaryOpen() { return this.isSplitOpen() && this.settings.secondaryOpen !== false; }
  openSplits() { return this.isSplitOpen() ? (this.settings.splits || []).filter((split) => split.open !== false) : []; }
  isPanelOpen(panelName) {
    if (panelName === "main") return true;
    if (panelName === "secondary") return this.isSecondaryOpen();
    return this.openSplits().some((split) => split.id === panelName);
  }
  isSplitStackVertical() {
    const mainHorizontal = ["left", "right"].includes(this.settings.position);
    const parallel = this.settings.arrangement === "parallel";
    return parallel ? !mainHorizontal : mainHorizontal;
  }
  routeState() {
    const open = this.isSplitOpen();
    const panels = {
      secondary: { open: this.isSecondaryOpen(), generation: this.generations.secondary }
    };
    for (const split of this.settings.splits || []) {
      panels[split.id] = {
        open: open && split.open !== false,
        generation: this.generations[split.id] || 1
      };
    }
    return { open, generation: this.generation, rules: this.rules, panels };
  }
  panelFor(record, state = this.routeState()) {
    const route = record.group || record;
    const target = route.panel || (route.secondary ? "secondary" : null);
    if (!target || !state.open) return "main";
    const panelState = state.panels?.[target];
    if (panelState) {
      return panelState.open && route.generation === panelState.generation ? target : "main";
    }
    return target === "secondary" && route.generation === state.generation ? "secondary" : "main";
  }

  refreshRules() {
    const custom = this.config.customRegexEnabled ? this.settings.custom : [];
    const catalog = [...this.config.presets, ...custom];
    const secondarySelected = new Set(this.settings.selected);
    const secondaryRules = this.config.enabled && this.settings.secondaryOpen !== false
      ? catalog.filter((rule) => secondarySelected.has(rule.id))
      : [];
    this.panelRules = { secondary: secondaryRules };
    const combined = [...secondaryRules];
    if (this.config.enabled) {
      for (const split of this.settings.splits || []) {
        const selected = new Set(split.selected);
        const splitRules = split.open !== false
          ? catalog.filter((rule) => selected.has(rule.id)).map((rule) => ({ ...rule, panel: split.id }))
          : [];
        this.panelRules[split.id] = splitRules;
        combined.push(...splitRules);
      }
    }
    this.rules = combined;
  }

  updateSettings(patch) {
    if (patch.open === false || patch.secondaryOpen === false || Object.hasOwn(patch, "position")) {
      this.popout?.redock({ focus: false });
    }
    const wasOpen = this.isSplitOpen();
    const previousPanels = new Map([
      ["secondary", this.isSecondaryOpen()],
      ...(this.settings.splits || []).map((split) => [split.id, wasOpen && split.open !== false])
    ]);
    const previousRulesJson = JSON.stringify({
      secondaryOpen: this.settings.secondaryOpen,
      selected: this.settings.selected,
      custom: this.settings.custom,
      splits: (this.settings.splits || []).map((split) => ({ id: split.id, open: split.open, selected: split.selected }))
    });
    const nextInput = { ...this.settings, ...patch };
    if (patch.open === true && !Object.hasOwn(patch, "secondaryOpen") && !wasOpen) {
      nextInput.secondaryOpen = true;
    }
    this.settings = normalizeOutputWindows(nextInput).value;
    this.storage.put(OUTPUT_WINDOWS_STORAGE_KEY, this.settings);
    showClientOptionsSaved(this.doc);
    this.syncSplitViews();
    const nextRulesJson = JSON.stringify({
      secondaryOpen: this.settings.secondaryOpen,
      selected: this.settings.selected,
      custom: this.settings.custom,
      splits: (this.settings.splits || []).map((split) => ({ id: split.id, open: split.open, selected: split.selected }))
    });
    if (Object.hasOwn(patch, "selected") || Object.hasOwn(patch, "custom") || previousRulesJson !== nextRulesJson) {
      this.refreshRules();
      this.runner.reset();
    }
    const nowOpen = this.isSplitOpen();
    const currentPanels = new Map([
      ["secondary", this.isSecondaryOpen()],
      ...(this.settings.splits || []).map((split) => [split.id, nowOpen && split.open !== false])
    ]);
    let routingChanged = wasOpen !== nowOpen;
    if (wasOpen !== nowOpen || previousPanels.get("secondary") !== currentPanels.get("secondary")) {
      // Old routing generations stay in main when a split is reopened.
      this.generation++;
      this.generations.secondary = this.generation;
      routingChanged = true;
    }
    for (const [id, wasPanelOpen] of previousPanels) {
      if (id === "secondary") continue;
      const isNowOpen = currentPanels.get(id) === true;
      if (wasPanelOpen !== isNowOpen) {
        this.generations[id] = (this.generations[id] || 1) + 1;
        routingChanged = true;
      }
    }
    for (const [id] of currentPanels) {
      if (!this.generations[id]) this.generations[id] = 1;
    }
    if (routingChanged) {
      this.reindex();
    }
    this.applyLayout();
    this.refreshPresentation();
    this.options.refresh();
    this.tools.changed({ routing: routingChanged });
  }

  importSettings(value) {
    const normalized = normalizeOutputWindows(value);
    if (normalized.valid && !this.config.customRegexEnabled) {
      normalized.skipped += normalized.value.custom.length;
      normalized.value.custom = this.settings.custom;
      normalized.value.selected = normalized.value.selected.filter((id) => !id.startsWith("custom-"))
        .concat(this.settings.selected.filter((id) => id.startsWith("custom-")));
      const existingSplits = new Map((this.settings.splits || []).map((split) => [split.id, split]));
      normalized.value.splits = (normalized.value.splits || []).map((split) => ({
        ...split,
        selected: split.selected.filter((id) => !id.startsWith("custom-"))
          .concat((existingSplits.get(split.id)?.selected || []).filter((id) => id.startsWith("custom-")))
      }));
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
      panels: context.panels, secondary: false, panel: null, ready: !rules?.length, routingRules: rules
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
      const match = matches[0];
      const matchedPanel = match === true ? "secondary" : typeof match === "string" ? match : null;
      group.secondary = matchedPanel === "secondary";
      group.panel = matchedPanel;
      if (matchedPanel && group.panels?.[matchedPanel]?.generation != null) {
        group.generation = group.panels[matchedPanel].generation;
      }
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
          const match = matches[id - first];
          const matchedPanel = match === true ? "secondary" : typeof match === "string" ? match : null;
          record.secondary = matchedPanel === "secondary";
          record.panel = matchedPanel;
          if (matchedPanel && context.panels?.[matchedPanel]?.generation != null) {
            record.generation = context.panels[matchedPanel].generation;
          }
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
      const label = view.name === "secondary" ? "secondary" : (view.label || view.name);
      button.setAttribute("aria-label", (view.paused ? "Resume " : "Pause ") + label + " scrolling");
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
    const target = this.isPanelOpen(panel) ? panel : "main";
    const view = this.views[target] || this.views.main;
    view.setPaused(!view.paused);
  }

  addSplit(initialSelected = []) {
    if (!this.config.enabled) return null;
    if (this.isSplitOpen() && !this.isSecondaryOpen()) {
      this.updateSettings({ secondaryOpen: true, ...(initialSelected.length ? { selected: initialSelected } : {}) });
      return { id: "secondary", name: "Secondary", open: true, selected: this.settings.selected };
    }
    if ((this.settings.splits || []).length >= MAX_ADDITIONAL_SPLITS) return null;
    const split = createNextSplit(this.settings.splits, initialSelected);
    this.updateSettings({ open: true, splits: [...(this.settings.splits || []), split] });
    return split;
  }

  closeSplit(panelName = "secondary") {
    if (!this.isSplitOpen()) return true;
    if (panelName && panelName !== "secondary" && panelName !== "all") {
      const target = (this.settings.splits || []).find((split) => split.id === panelName);
      if (!target) return true;
      if (!this.win.confirm("Close the " + target.name + " output window? Its retained output will return to the main window.")) return false;
      const nextSplits = this.settings.splits.filter((split) => split.id !== panelName);
      const anyRemaining = this.isSecondaryOpen() || nextSplits.some((split) => split.open !== false);
      this.updateSettings({
        splits: nextSplits,
        ...(anyRemaining ? {} : { open: false, secondaryOpen: true })
      });
      return true;
    }
    if (panelName === "secondary" && this.openSplits().length > 0) {
      if (!this.win.confirm("Close the secondary output window? Its retained output will return to the main window.")) return false;
      this.updateSettings({ secondaryOpen: false });
      return true;
    }
    if (!this.win.confirm("Close the secondary output window? Its retained output will return to the main window.")) return false;
    this.updateSettings({ open: false, secondaryOpen: true });
    return true;
  }

  refreshPresentation() {
    const primary = this.client.buffer;
    const colors = this.win.getComputedStyle(primary);
    this.workspace.style.setProperty("--output-background", colors.backgroundColor);
    this.workspace.style.setProperty("--output-foreground", colors.color);
    for (const [name, view] of Object.entries(this.views)) {
      const presentation = getOutputPresentation(this.client.preferences, name !== "main");
      if (name !== "main") {
        view.element.className = primary.className;
        view.element.classList.remove(...FONT_CHOICES.map((font) => font + "Text"), ...COLORSET_CHOICES.map((theme) => "colorset-" + theme));
        view.element.classList.add(presentation.font + "Text");
        if (name !== "secondary") view.element.classList.add("output-split-scroll");
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
    if (help) {
      const hasRules = Boolean(this.panelRules?.secondary?.length);
      help.classList.toggle("hide", this.views.secondary.index.length > 0);
      help.querySelector("p").textContent = hasRules
        ? "Waiting for matching output."
        : "Send output to this window by opening Options → Output Windows and selecting output filters.";
      help.querySelector("button").classList.toggle("hide", hasRules);
    }
    for (const split of this.settings.splits || []) {
      const view = this.views[split.id];
      const splitHelp = view?.element.ownerDocument.querySelector("#output-" + split.id + "-help");
      if (!splitHelp) continue;
      const hasRules = Boolean(this.panelRules?.[split.id]?.length);
      splitHelp.classList.toggle("hide", view.index.length > 0);
      splitHelp.querySelector("p").textContent = hasRules
        ? "Waiting for matching output."
        : "Send output to this window by opening Options → Output Windows and selecting output filters.";
      splitHelp.querySelector("button").classList.toggle("hide", hasRules);
    }
  }

  applyLayout() {
    const open = this.isSplitOpen();
    const detached = this.popout?.isDetached();
    const secondaryDocked = this.isSecondaryOpen() && !detached;
    const openExtraSplits = this.openSplits();
    const dockedPanels = [
      ...(secondaryDocked ? ["secondary"] : []),
      ...openExtraSplits.map((split) => split.id)
    ];
    const hasDockedSplit = dockedPanels.length > 0;
    const multiSplit = openExtraSplits.length > 0;

    this.workspace.classList.toggle("split-open", hasDockedSplit);
    this.workspace.classList.toggle("multi-split-open", multiSplit && hasDockedSplit);
    this.workspace.dataset.position = this.settings.position;
    this.workspace.dataset.splitArrangement = this.settings.arrangement || "stacked";
    this.workspace.style.setProperty("--secondary-size", this.settings.secondarySize + "%");

    const secondaryPanel = this.doc.querySelector("#output-secondary-panel");
    secondaryPanel.classList.toggle("hide", !secondaryDocked);
    if (secondaryDocked && multiSplit) {
      const firstExtraSize = openExtraSplits[0]?.size ?? 50;
      secondaryPanel.style.setProperty("--split-size", String(100 - firstExtraSize));
    } else {
      secondaryPanel.style.removeProperty("--split-size");
    }

    const stackVertical = this.isSplitStackVertical();
    for (const split of this.settings.splits || []) {
      const panel = this.doc.querySelector("#output-" + split.id + "-panel");
      const subDivider = this.doc.querySelector("#output-divider-" + split.id);
      const isOpen = open && split.open !== false;
      const dockedIndex = dockedPanels.indexOf(split.id);
      if (panel) {
        panel.classList.toggle("hide", !isOpen);
        panel.style.setProperty("--split-size", String(split.size));
      }
      if (subDivider) {
        const showSubDivider = isOpen && dockedIndex > 0;
        subDivider.classList.toggle("hide", !showSubDivider);
        subDivider.setAttribute("aria-orientation", stackVertical ? "horizontal" : "vertical");
        subDivider.setAttribute("aria-valuenow", Math.round(split.size));
      }
    }

    const divider = this.doc.querySelector("#output-divider");
    divider.classList.toggle("hide", !hasDockedSplit);
    divider.setAttribute("aria-orientation", ["left", "right"].includes(this.settings.position) ? "vertical" : "horizontal");
    divider.setAttribute("aria-valuenow", Math.round(this.settings.secondarySize));
    const button = this.doc.querySelector("#button-output-split");
    button?.classList.toggle("hide", !this.config.enabled);
    button?.setAttribute("aria-expanded", String(open));
    if (button) button.textContent = detached ? "REDOCK" : open ? "CLOSE SPLIT" : "SPLIT";
    for (const addBtn of this.doc.querySelectorAll("[data-output-add-split]")) {
      addBtn.classList.toggle("hide", !this.config.enabled || (this.settings.splits || []).length >= MAX_ADDITIONAL_SPLITS);
    }
    if (!this.isPanelOpen(this.activePanel)) {
      this.activePanel = this.isSecondaryOpen() ? "secondary" : (openExtraSplits[0]?.id || "main");
    }
    this.toolbar?.refresh();
    for (const view of Object.values(this.views)) view.schedule();
    this.updateHelp();
  }

  syncSplitViews() {
    const splits = this.settings.splits || [];
    const activeIds = new Set(splits.map((split) => split.id));
    for (const [name, view] of Object.entries(this.views)) {
      if (name === "main" || name === "secondary" || activeIds.has(name)) continue;
      view.destroy();
      delete this.views[name];
      this.doc.querySelector("#output-" + name + "-panel")?.remove();
      this.doc.querySelector("#output-divider-" + name)?.remove();
    }
    for (const split of splits) {
      if (!this.generations[split.id]) this.generations[split.id] = 1;
      if (!this.views[split.id]) {
        const element = this.createSplitPanelDom(split);
        this.views[split.id] = new VirtualOutputView({
          element, client: this.client, win: this.win, name: split.id, label: split.name,
          onActive: (panel) => { this.activePanel = panel; this.updatePauseButton(); },
          onState: (view) => this.updateViewState(view),
          onMessage: (message) => this.report(message)
        });
      } else {
        this.views[split.id].label = split.name;
        const title = this.doc.querySelector("[data-output-title=" + split.id + "]");
        if (title) title.textContent = split.name;
      }
    }
  }

  createSplitPanelDom(split) {
    const subDivider = this.doc.createElement("div");
    subDivider.id = "output-divider-" + split.id;
    subDivider.className = "output-divider output-sub-divider hide";
    subDivider.dataset.splitDivider = split.id;
    subDivider.setAttribute("role", "separator");
    subDivider.setAttribute("tabindex", "0");
    subDivider.setAttribute("aria-label", "Resize " + split.name + " output window");
    subDivider.setAttribute("aria-orientation", this.isSplitStackVertical() ? "horizontal" : "vertical");
    subDivider.setAttribute("aria-valuemin", "15");
    subDivider.setAttribute("aria-valuemax", "85");
    subDivider.setAttribute("aria-valuenow", String(Math.round(split.size)));

    const panel = this.doc.createElement("section");
    panel.id = "output-" + split.id + "-panel";
    panel.dataset.outputPanel = split.id;
    panel.className = "output-panel output-split-panel hide";
    panel.setAttribute("aria-label", split.name + " output window");

    const header = this.doc.createElement("header");
    header.className = "output-panel-header";
    const title = this.doc.createElement("span");
    title.dataset.outputTitle = split.id;
    title.textContent = split.name;
    const unread = this.doc.createElement("span");
    unread.dataset.outputUnread = split.id;
    unread.className = "output-unread";
    unread.setAttribute("aria-live", "polite");
    const pause = this.doc.createElement("button");
    pause.type = "button";
    pause.className = "btn btn-primary btn-xs output-pause";
    pause.dataset.outputPause = split.id;
    pause.setAttribute("aria-label", "Pause " + split.name + " scrolling");
    const pauseLabel = this.doc.createElement("span");
    pauseLabel.className = "pause-label";
    pauseLabel.textContent = "PAUSE SCROLL";
    pause.append(pauseLabel);
    const addSplit = this.doc.createElement("button");
    addSplit.type = "button";
    addSplit.className = "btn btn-primary btn-xs output-add-split";
    addSplit.dataset.outputAddSplit = split.id;
    addSplit.setAttribute("aria-label", "Add split output window");
    addSplit.textContent = "+ Split";
    const close = this.doc.createElement("button");
    close.type = "button";
    close.className = "btn btn-primary btn-xs output-close";
    close.dataset.outputClose = split.id;
    close.setAttribute("aria-label", "Close " + split.name + " output window");
    close.textContent = "×";
    header.append(title, unread, pause, addSplit, close);

    const buffer = this.doc.createElement("div");
    buffer.id = split.id + "Buffer";
    buffer.className = "standardText output-scroll output-split-scroll";
    const help = this.doc.createElement("div");
    help.id = "output-" + split.id + "-help";
    help.className = "output-secondary-help";
    const helpText = this.doc.createElement("p");
    helpText.textContent = "Send output to this window by opening Options → Output Windows and selecting output filters.";
    const configBtn = this.doc.createElement("button");
    configBtn.type = "button";
    configBtn.dataset.outputConfigure = split.id;
    configBtn.className = "btn btn-primary";
    configBtn.textContent = "Configure output window";
    help.append(helpText, configBtn);
    buffer.append(help);
    panel.append(header, buffer);
    this.splitStack.append(subDivider, panel);

    const activate = () => { this.activePanel = split.id; this.updatePauseButton(); };
    header.addEventListener("focusin", activate);
    header.addEventListener("pointerdown", activate);
    pause.addEventListener("click", () => {
      const view = this.views[split.id];
      this.activePanel = view.name;
      view.setPaused(!view.paused);
    });
    addSplit.addEventListener("click", () => this.addSplit());
    close.addEventListener("click", () => this.closeSplit(split.id));
    configBtn.addEventListener("click", () => this.configure(split.id));
    this.bindSubDivider(subDivider, split.id);
    return buffer;
  }

  bindSubDivider(subDivider, splitId) {
    let dragging = false;
    let frame;
    let pendingSize;
    const changeSize = () => {
      frame = null;
      const split = (this.settings.splits || []).find((item) => item.id === splitId);
      if (!split) return;
      split.size = Math.max(15, Math.min(85, pendingSize));
      const panel = this.doc.querySelector("#output-" + splitId + "-panel");
      panel?.style.setProperty("--split-size", String(split.size));
      const openExtra = this.openSplits();
      if (openExtra[0]?.id === splitId) {
        this.doc.querySelector("#output-secondary-panel")?.style.setProperty("--split-size", String(100 - split.size));
      }
      subDivider.setAttribute("aria-valuenow", Math.round(split.size));
    };
    subDivider.addEventListener("pointerdown", (event) => {
      dragging = true;
      subDivider.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    subDivider.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const rect = this.splitStack.getBoundingClientRect();
      const vertical = this.isSplitStackVertical();
      const fraction = vertical
        ? (event.clientY - rect.top) / Math.max(1, rect.height)
        : (event.clientX - rect.left) / Math.max(1, rect.width);
      pendingSize = (1 - fraction) * 100;
      if (frame == null) frame = this.win.requestAnimationFrame(changeSize);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      subDivider.addEventListener(type, () => {
        if (!dragging) return;
        dragging = false;
        if (frame != null) { this.win.cancelAnimationFrame(frame); changeSize(); }
        this.updateSettings({ splits: this.settings.splits });
      });
    }
    subDivider.addEventListener("keydown", (event) => {
      const split = (this.settings.splits || []).find((item) => item.id === splitId);
      if (!split) return;
      let size = split.size;
      if (["ArrowRight", "ArrowUp"].includes(event.key)) size += 2;
      else if (["ArrowLeft", "ArrowDown"].includes(event.key)) size -= 2;
      else if (event.key === "Home") size = 15;
      else if (event.key === "End") size = 85;
      else return;
      event.preventDefault();
      const nextSplits = this.settings.splits.map((item) => item.id === splitId ? { ...item, size } : item);
      this.updateSettings({ splits: nextSplits });
    });
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
      if (this.isSplitOpen()) this.closeSplit("all");
      else this.updateSettings({ open: true });
    });
    this.doc.querySelector("#button-output-add-split")?.addEventListener("click", () => this.addSplit());
    this.doc.querySelector("#button-output-close").addEventListener("click", () => this.closeSplit("secondary"));
    this.doc.querySelector("#button-output-configure").addEventListener("click", () => this.configure("secondary"));
    for (const name of ["main", "secondary"]) {
      const button = this.doc.querySelector("[data-output-pause=" + name + "]");
      button?.addEventListener("click", () => {
        const view = this.views[name];
        this.activePanel = view.name;
        view.setPaused(!view.paused);
      });
    }
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

  configure(panelName) {
    this.win.focus();
    this.client.clientOptionsOverlay.classList.remove("hide");
    this.doc.querySelector("#client-options-tab-output")?.click();
    if (panelName) this.options?.setActiveWindow?.(panelName);
  }
}

export function setupOutputWindows({ client, doc, win, ...options }) {
  if (!doc.querySelector("#output-workspace")) return;
  return new OutputWindows({ client, doc, win, ...options });
}
