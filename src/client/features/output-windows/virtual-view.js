import { HeightIndex } from "./height-index.js";
import { renderRecordHtml, toggleRecordPreview } from "./record-renderer.js";

const MAX_SCROLL_HEIGHT = 8_000_000;
const SCROLL_EPSILON = 0.01; // Ignore rounding noise without swallowing subpixel gestures.

export class VirtualOutputView {
  constructor({ element, client, win, name, onActive = () => {}, onState = () => {}, onMessage = () => {} }) {
    Object.assign(this, { element, client, win, name, onActive, onState, onMessage });
    this.index = new HeightIndex();
    this.mounted = new Map();
    this.gaps = new Map();
    this.paused = false;
    this.following = true;
    this.unread = 0;
    this.frame = null;
    this.anchor = null;
    this.programmatic = false;
    const doc = element.ownerDocument;
    this.top = doc.createElement("div");
    this.rows = doc.createElement("div");
    this.bottom = doc.createElement("div");
    this.top.className = this.bottom.className = "output-spacer";
    this.top.setAttribute("aria-hidden", "true");
    this.bottom.setAttribute("aria-hidden", "true");
    this.rows.className = "output-rows";
    this.rows.setAttribute("role", "list");
    this.help = element.querySelector("#output-secondary-help");
    element.replaceChildren(this.top, this.rows, this.bottom);
    if (this.help) element.append(this.help);
    element.setAttribute("role", "region");
    element.setAttribute("aria-label", name === "main" ? "Main output" : "Secondary output");
    element.setAttribute("tabindex", "0");
    element.removeAttribute("aria-live");
    this.listen = [];
    this.bind(element, "scroll", () => this.onScroll());
    this.bind(element, "pointerdown", () => this.activate());
    this.bind(element, "focusin", () => this.activate());
    this.bind(element, "click", (event) => this.onClick(event));
    this.bind(element, "keydown", (event) => this.onKey(event));
    this.bind(element, "dblclick", (event) => {
      if (client.preferences.autoScroll !== "dbl" || event.target.closest("button,a")) return;
      event.preventDefault();
      const selection = doc.getSelection();
      if (selection && element.contains(selection.anchorNode)) selection.removeAllRanges();
      this.setPaused(!this.paused);
      this.client.inputReader?.focus({ preventScroll: true });
    });
    this.bind(element, "pointerdown", (event) => {
      if (client.preferences.autoScroll !== "long" || event.target.closest("button,a")) return;
      this.longPress = win.setTimeout(() => this.setPaused(!this.paused), 2000);
    });
    for (const type of ["pointerup", "pointercancel", "pointerleave"]) {
      this.bind(element, type, () => win.clearTimeout(this.longPress));
    }
    this.bind(doc, "selectionchange", () => this.schedule());
    if (win.ResizeObserver) {
      this.observer = new win.ResizeObserver((entries) => {
        for (const entry of entries) {
          const id = Number(entry.target.dataset.outputId);
          const index = this.index.indexOfId(id);
          if (index >= 0) this.index.measure(index, entry.borderBoxSize?.[0]?.blockSize || entry.contentRect.height);
        }
        this.schedule();
      });
      this.containerObserver = new win.ResizeObserver(() => this.schedule());
      this.containerObserver.observe(element);
    }
  }

  bind(target, type, listener) {
    target.addEventListener(type, listener);
    this.listen.push(() => target.removeEventListener(type, listener));
  }

  activate() {
    this.onActive(this.name);
  }

  onClick(event) {
    const control = event.target.closest("[data-output-media]");
    if (control) toggleRecordPreview(control, control.closest("[data-output-id]"), this.client, this.element.clientWidth);
  }

  onKey(event) {
    if (!this.index.length) return;
    if (event.target.closest("button,a")) return;
    const movement = { ArrowUp: -1, ArrowDown: 1, PageUp: -20, PageDown: 20 }[event.key];
    if (!movement) return;
    event.preventDefault();
    const row = event.target.closest("[data-output-id]");
    const current = row ? this.index.indexOfId(Number(row.dataset.outputId)) : this.index.offsetIndex(this.logicalTop());
    const next = Math.max(0, Math.min(this.index.length - 1, current + movement));
    const record = this.index.at(next);
    if (!record) return;
    this.jump(record.id);
    this.render();
    this.mounted.get(record.id)?.focus({ preventScroll: true });
  }

  viewportHeight() {
    const style = this.win.getComputedStyle(this.element);
    return Math.max(1, (this.element.clientHeight || 400) - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0));
  }

  scale(viewport = this.viewportHeight()) {
    return Math.max(1, (this.index.total - viewport) / (MAX_SCROLL_HEIGHT - viewport));
  }

  logicalTop() { return this.element.scrollTop * this.scale(); }

  captureAnchor() {
    const index = this.index.offsetIndex(this.logicalTop());
    const record = this.index.at(index);
    if (record) this.anchor = { id: record.id, offset: this.logicalTop() - this.index.prefix(index) };
  }

  onScroll() {
    const top = this.element.scrollTop;
    if (this.pendingJump
      || (this.expectedScrollTop != null && Math.abs(top - this.expectedScrollTop) < SCROLL_EPSILON)) return;
    const maximum = Math.max(0, this.element.scrollHeight - this.element.clientHeight);
    // Media collapse or resizing can clamp the viewport to a smaller bottom.
    // That layout adjustment is not an upward user gesture or a pause request.
    if (this.element.clientHeight > 0 && this.expectedScrollTop > maximum + SCROLL_EPSILON
      && Math.abs(top - maximum) < SCROLL_EPSILON) {
      this.expectedScrollTop = top;
      this.schedule();
      return;
    }
    // Moving away from the tail must win over the return-to-bottom tolerance.
    // Remember accepted scrolls too, since several can arrive before a render.
    const movingUp = this.expectedScrollTop != null && top < this.expectedScrollTop;
    this.expectedScrollTop = top;
    this.onActive(this.name);
    if (!this.index.length && this.help) return;
    const bottom = !movingUp && maximum - top <= 24;
    this.following = bottom;
    if (this.client.preferences.scrollUpToPause && this.paused === bottom) this.setPaused(!bottom);
    this.captureAnchor();
    this.schedule();
  }

  setPaused(value) {
    this.paused = value;
    this.following = !value;
    if (value) this.captureAnchor();
    else { this.unread = 0; this.anchor = null; }
    this.element.classList.toggle("scroll-disabled", value);
    this.onState(this);
    this.schedule();
  }

  append(record, countUnread = true) {
    this.index.append(record);
    // With automatic pausing disabled, manual scrollback lasts until new
    // output arrives. Measurement and repaint work must not pull it to the tail.
    if (!this.paused && countUnread) { this.following = true; this.anchor = null; }
    if (this.paused && countUnread) this.unread++;
    this.schedule();
  }

  prune(first) {
    if (this.hasSelection()) {
      const selection = this.element.ownerDocument.getSelection();
      const selectedId = (node) => Number((node.nodeType === 1 ? node : node.parentElement)?.closest("[data-output-id]")?.dataset.outputId);
      if (selectedId(selection.anchorNode) < first || selectedId(selection.focusNode) < first) {
        selection.removeAllRanges();
        this.onMessage("The text selection was cleared because some of its history was removed.");
      }
    }
    if (this.paused && !this.anchor) this.captureAnchor();
    this.index.prune(first);
    if (this.anchor && this.anchor.id < first) this.anchor = this.index.length ? { id: this.index.at(0).id, offset: 0 } : null;
    this.schedule();
  }

  reset() {
    this.releaseAll();
    // Clearing/reindexing shrinks the scroll surface. Establish its new native
    // position so the resulting clamp is not mistaken for an upward gesture.
    this.top.style.height = this.bottom.style.height = "0px";
    this.element.scrollTop = 0;
    this.expectedScrollTop = this.element.scrollTop;
    this.index = new HeightIndex(this.index.defaultHeight);
    this.anchor = null;
    this.following = !this.paused;
    this.unread = 0;
    this.highlight = null;
    this.onState(this);
    this.schedule();
  }

  jump(id, highlight) {
    const index = this.index.indexOfId(id);
    if (index < 0) return false;
    this.paused = true;
    this.following = false;
    this.pendingJump = true;
    this.anchor = { id, offset: 0 };
    this.highlight = highlight ? { id, ...highlight } : null;
    this.element.classList.add("scroll-disabled");
    this.onState(this);
    this.schedule();
    return true;
  }

  schedule() {
    if (this.frame != null) return;
    const schedule = this.win.requestAnimationFrame?.bind(this.win) || ((fn) => this.win.setTimeout(fn, 16));
    this.frame = schedule(() => { this.frame = null; this.render(); });
  }

  hasSelection() {
    const selection = this.element.ownerDocument.getSelection();
    return selection && !selection.isCollapsed && this.rows.contains(selection.anchorNode);
  }

  release(id, node) {
    const record = this.index.at(this.index.indexOfId(id));
    if (record && node.querySelector("[data-output-media]")) record.collapsed = true;
    this.observer?.unobserve(node);
    node.remove();
    this.mounted.delete(id);
  }

  releaseAll() {
    for (const [id, node] of this.mounted) this.release(id, node);
    this.rows.replaceChildren();
    this.gaps.clear();
  }

  createRow(record, position) {
    const row = this.element.ownerDocument.createElement("div");
    row.className = "output-row";
    if (record.group && this.client.preferences.sdwcNowrapBlocks) row.classList.add("output-nowrap-row");
    row.dataset.outputId = record.id;
    row.setAttribute("role", "listitem");
    row.setAttribute("aria-posinset", position + 1);
    row.setAttribute("aria-setsize", this.index.length);
    row.tabIndex = -1;
    row.innerHTML = renderRecordHtml(record, {
      client: this.client, width: this.element.clientWidth || 580, state: { collapsed: record.collapsed }
    });
    if (record.group && this.client.preferences.sdwcNowrapBlocks) {
      row.scrollLeft = record.group.scrollLeft || 0;
      row.addEventListener("scroll", () => {
        if (row.dataset.syncedScroll === String(row.scrollLeft)) {
          delete row.dataset.syncedScroll;
          return;
        }
        delete row.dataset.syncedScroll;
        if (record.group.scrollLeft === row.scrollLeft) return;
        record.group.scrollLeft = row.scrollLeft;
        for (const [id, mounted] of this.mounted) {
          if (id !== record.id && this.index.at(this.index.indexOfId(id))?.group === record.group) {
            mounted.dataset.syncedScroll = String(Math.min(row.scrollLeft, mounted.scrollWidth - mounted.clientWidth));
            mounted.scrollLeft = row.scrollLeft;
          }
        }
      }, { passive: true });
    }
    this.observer?.observe(row);
    this.mounted.set(record.id, row);
    return row;
  }

  applyHighlight(row, record) {
    const selected = this.highlight?.id === record.id;
    const key = selected ? this.highlight.start + ":" + this.highlight.length : "";
    if (row.dataset.highlight === key) return;
    row.querySelectorAll("mark").forEach((mark) => mark.replaceWith(...mark.childNodes));
    row.dataset.highlight = key;
    if (!selected) return;
    let start = this.highlight.start;
    let remaining = this.highlight.length;
    const walker = row.ownerDocument.createTreeWalker(row, 4);
    const nodes = [];
    while (walker.nextNode()) {
      if (!walker.currentNode.parentElement.closest("button")) nodes.push(walker.currentNode);
    }
    for (const node of nodes) {
      if (start >= node.length) { start -= node.length; continue; }
      const length = Math.min(node.length - start, remaining);
      if (length <= 0) break;
      const range = row.ownerDocument.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + length);
      const mark = row.ownerDocument.createElement("mark");
      range.surroundContents(mark);
      remaining -= length;
      start = 0;
    }
  }

  render() {
    if (this.element.hidden) return;
    const selection = this.hasSelection() ? this.element.ownerDocument.getSelection() : null;
    const endpoints = selection && {
      anchorNode: selection.anchorNode, anchorOffset: selection.anchorOffset,
      focusNode: selection.focusNode, focusOffset: selection.focusOffset
    };
    if (selection && !this.anchor) this.captureAnchor();
    this.onState(this);
    if (!this.index.length && this.help) {
      this.top.style.height = this.bottom.style.height = "0px";
      this.pendingJump = false;
      return;
    }
    const viewport = this.viewportHeight();
    const scale = this.scale(viewport);
    let logicalTop = this.element.scrollTop * scale;
    if (!this.paused && this.following && !selection) logicalTop = Math.max(0, this.index.total - viewport);
    else if (this.anchor) {
      const index = this.index.indexOfId(this.anchor.id);
      if (index < 0) return;
      if (index >= 0) logicalTop = this.index.prefix(index) + this.anchor.offset;
    }
    logicalTop = Math.max(0, Math.min(logicalTop, Math.max(0, this.index.total - viewport)));
    const start = this.index.offsetIndex(Math.max(0, logicalTop - viewport));
    const end = this.index.length ? Math.min(this.index.length, this.index.offsetIndex(logicalTop + viewport * 2) + 1) : 0;
    const wanted = new Set();
    for (let i = start; i < end; i++) wanted.add(this.index.at(i).id);
    if (endpoints) {
      for (const node of [endpoints.anchorNode, endpoints.focusNode]) {
        const row = (node.nodeType === 1 ? node : node.parentElement)?.closest("[data-output-id]");
        const id = Number(row?.dataset.outputId);
        if (this.index.indexOfId(id) >= 0) wanted.add(id);
      }
    }
    for (const [id, node] of this.mounted) if (!wanted.has(id)) this.release(id, node);
    const positions = [...wanted].map((id) => this.index.indexOfId(id)).sort((a, b) => a - b);
    const gapHeight = this.gapHeights(positions, start, end, logicalTop, scale);
    const usedGaps = new Set();
    let previous = null;
    const insert = (node) => {
      if (previous ? previous.nextSibling !== node : this.rows.firstChild !== node) {
        this.rows.insertBefore(node, previous ? previous.nextSibling : this.rows.firstChild);
      }
      previous = node;
    };
    for (let offset = 0; offset < positions.length; offset++) {
      const i = positions[offset];
      const before = positions[offset - 1];
      if (offset && i > before + 1) {
        let gap = this.gaps.get(i);
        if (!gap) {
          gap = this.element.ownerDocument.createElement("div");
          gap.className = "output-spacer";
          gap.setAttribute("aria-hidden", "true");
          this.gaps.set(i, gap);
        }
        gap.style.height = gapHeight(before + 1, i) + "px";
        usedGaps.add(i);
        insert(gap);
      }
      const record = this.index.at(i);
      const row = this.mounted.get(record.id) || this.createRow(record, i);
      if (i < start || i >= end) {
        for (const control of row.querySelectorAll("[data-output-media][aria-expanded=true]")) {
          toggleRecordPreview(control, row, this.client, this.element.clientWidth);
          record.collapsed = true;
        }
      }
      insert(row);
      row.setAttribute("aria-posinset", i + 1);
      row.setAttribute("aria-setsize", this.index.length);
      if (record.group && this.client.preferences.sdwcNowrapBlocks && row.scrollLeft !== record.group.scrollLeft) {
        row.dataset.syncedScroll = String(Math.min(record.group.scrollLeft, row.scrollWidth - row.clientWidth));
        row.scrollLeft = record.group.scrollLeft;
      }
      this.applyHighlight(row, record);
    }
    for (const [id, gap] of this.gaps) {
      if (!usedGaps.has(id)) { gap.remove(); this.gaps.delete(id); }
    }
    const physicalTop = logicalTop / scale;
    this.top.style.height = gapHeight(0, positions[0] ?? 0) + "px";
    this.bottom.style.height = gapHeight((positions.at(-1) ?? -1) + 1, this.index.length) + "px";
    this.programmatic = true;
    // A redundant write can interrupt the browser's smooth wheel/touch scroll.
    if (Math.abs(this.element.scrollTop - physicalTop) >= SCROLL_EPSILON) this.element.scrollTop = physicalTop;
    this.expectedScrollTop = this.element.scrollTop;
    this.pendingJump = false;
    if (endpoints && endpoints.anchorNode.isConnected && endpoints.focusNode.isConnected
      && (selection.anchorNode !== endpoints.anchorNode || selection.anchorOffset !== endpoints.anchorOffset
        || selection.focusNode !== endpoints.focusNode || selection.focusOffset !== endpoints.focusOffset)) {
      selection.setBaseAndExtent(endpoints.anchorNode, endpoints.anchorOffset, endpoints.focusNode, endpoints.focusOffset);
    }
    this.win.setTimeout(() => { this.programmatic = false; }, 0);
  }

  gapHeights(positions, start, end, logicalTop, scale) {
    // Pin only selection endpoints, not every row crossed while selecting.
    // Divide each distant spacer around those endpoints without expanding the
    // browser's physical scroll range or compressing mounted text itself.
    const before = this.index.prefix(start);
    const after = this.index.total - this.index.prefix(end);
    const physicalBefore = Math.max(0, logicalTop / scale + before - logicalTop);
    const visible = this.index.prefix(end) - before;
    const physicalAfter = Math.max(0, Math.min(MAX_SCROLL_HEIGHT, this.index.total) - physicalBefore - visible);
    let pinnedBefore = 0;
    let pinnedAfter = 0;
    for (const index of positions) {
      const height = this.index.prefix(index + 1) - this.index.prefix(index);
      if (index < start) pinnedBefore += height;
      if (index >= end) pinnedAfter += height;
    }
    const beforeScale = Math.max(0, (physicalBefore - pinnedBefore) / Math.max(1, before - pinnedBefore));
    const afterScale = Math.max(0, (physicalAfter - pinnedAfter) / Math.max(1, after - pinnedAfter));
    return (from, to) => Math.max(0, this.index.prefix(to) - this.index.prefix(from)) * (to <= start ? beforeScale : from >= end ? afterScale : 1);
  }

  refreshPresentation() {
    if (this.hasSelection()) { this.schedule(); return; }
    this.releaseAll();
    this.schedule();
  }

  destroy() {
    if (this.frame != null) (this.win.cancelAnimationFrame || this.win.clearTimeout).call(this.win, this.frame);
    this.win.clearTimeout(this.longPress);
    this.observer?.disconnect();
    this.containerObserver?.disconnect();
    this.listen.forEach((remove) => remove());
    this.releaseAll();
  }
}
