import { HeightIndex } from "./height-index.js";
import { renderRecordHtml, toggleRecordPreview } from "./record-renderer.js";

const MAX_SCROLL_HEIGHT = 8_000_000;

export class VirtualOutputView {
  constructor({ element, client, win, name, onActive = () => {}, onRow = () => {}, onState = () => {}, onMessage = () => {} }) {
    Object.assign(this, { element, client, win, name, onActive, onRow, onState, onMessage });
    this.index = new HeightIndex();
    this.mounted = new Map();
    this.paused = false;
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
    element.replaceChildren(this.top, this.rows, this.bottom);
    element.setAttribute("role", "region");
    element.setAttribute("aria-label", name === "main" ? "Main output" : "Secondary output");
    element.setAttribute("tabindex", "0");
    element.removeAttribute("aria-live");
    this.listen = [];
    this.bind(element, "scroll", () => this.onScroll());
    this.bind(element, "pointerdown", (event) => this.activate(event));
    this.bind(element, "focusin", (event) => this.activate(event));
    this.bind(element, "click", (event) => this.onClick(event));
    this.bind(element, "keydown", (event) => this.onKey(event));
    this.bind(element, "dblclick", (event) => {
      if (client.preferences.autoScroll !== "dbl" || event.target.closest("button,a")) return;
      event.preventDefault();
      this.setPaused(!this.paused);
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

  activate(event) {
    this.onActive(this.name);
    const row = event.target.closest("[data-output-id]");
    if (row) this.onRow(Number(row.dataset.outputId), this.name);
  }

  onClick(event) {
    const control = event.target.closest("[data-output-media]");
    if (control) toggleRecordPreview(control, control.closest("[data-output-id]"), this.client, this.element.clientWidth);
  }

  onKey(event) {
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
    this.onRow(record.id, this.name);
  }

  scale() {
    const viewport = this.element.clientHeight || 400;
    return Math.max(1, (this.index.total - viewport) / (MAX_SCROLL_HEIGHT - viewport));
  }

  logicalTop() { return this.element.scrollTop * this.scale(); }

  captureAnchor() {
    const index = this.index.offsetIndex(this.logicalTop());
    const record = this.index.at(index);
    if (record) this.anchor = { id: record.id, offset: this.logicalTop() - this.index.prefix(index) };
  }

  onScroll() {
    if (this.programmatic || this.pendingJump
      || (this.expectedScrollTop != null && Math.abs(this.element.scrollTop - this.expectedScrollTop) < 1)) return;
    this.onActive(this.name);
    const bottom = this.element.scrollHeight - this.element.scrollTop - this.element.clientHeight <= 24;
    if (this.client.preferences.scrollUpToPause && this.paused === bottom) this.setPaused(!bottom);
    if (this.paused) this.captureAnchor();
    this.schedule();
  }

  setPaused(value) {
    this.paused = value;
    if (value) this.captureAnchor();
    else { this.unread = 0; this.anchor = null; }
    this.element.classList.toggle("scroll-disabled", value);
    this.onState(this);
    this.schedule();
  }

  append(record, countUnread = true) {
    this.index.append(record);
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
    this.index = new HeightIndex(this.index.defaultHeight);
    this.anchor = null;
    this.unread = 0;
    this.highlight = null;
    this.onState(this);
    this.schedule();
  }

  jump(id, highlight) {
    const index = this.index.indexOfId(id);
    if (index < 0) return false;
    this.paused = true;
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
    if (this.hasSelection() || this.element.hidden) return;
    this.onState(this);
    const viewport = this.element.clientHeight || 400;
    const scale = this.scale();
    let logicalTop = this.logicalTop();
    if (!this.paused) logicalTop = Math.max(0, this.index.total - viewport);
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
    for (const [id, node] of this.mounted) if (!wanted.has(id)) this.release(id, node);
    let previous = null;
    for (let i = start; i < end; i++) {
      const record = this.index.at(i);
      const row = this.mounted.get(record.id) || this.createRow(record, i);
      if (previous ? previous.nextSibling !== row : this.rows.firstChild !== row) {
        this.rows.insertBefore(row, previous ? previous.nextSibling : this.rows.firstChild);
      }
      previous = row;
      row.setAttribute("aria-posinset", i + 1);
      row.setAttribute("aria-setsize", this.index.length);
      if (record.group && this.client.preferences.sdwcNowrapBlocks && row.scrollLeft !== record.group.scrollLeft) {
        row.dataset.syncedScroll = String(Math.min(record.group.scrollLeft, row.scrollWidth - row.clientWidth));
        row.scrollLeft = record.group.scrollLeft;
      }
      row.classList.toggle("output-range-selected", Boolean(this.range && record.id >= this.range.start && record.id <= this.range.end));
      this.applyHighlight(row, record);
    }
    // Compress distant spacers to stay below browser scroll-height limits.
    // Rows in the mounted window still occupy their actual measured pixels.
    const rowHeight = this.index.prefix(end) - this.index.prefix(start);
    const physicalTop = logicalTop / scale;
    const top = Math.max(0, physicalTop + this.index.prefix(start) - logicalTop);
    this.top.style.height = top + "px";
    this.bottom.style.height = Math.max(0, Math.min(MAX_SCROLL_HEIGHT, this.index.total) - top - rowHeight) + "px";
    this.programmatic = true;
    this.element.scrollTop = physicalTop;
    this.expectedScrollTop = this.element.scrollTop;
    this.pendingJump = false;
    this.win.setTimeout(() => { this.programmatic = false; }, 0);
  }

  refreshPresentation() {
    if (this.hasSelection()) return;
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
