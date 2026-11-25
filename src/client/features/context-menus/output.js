import { readOutputSelection, copyOutputSelection } from "../output-windows/selection.js";

const excluded = "button, [data-preview-for], img, video, iframe, input, textarea, .ace_editor";

export function projectOutputRow(row) {
  const doc = row.ownerDocument;
  const walker = doc.createTreeWalker(row, 4);
  const nodes = [];
  let text = "";
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement.closest(excluded)) continue;
    nodes.push({ node, start: text.length, end: text.length + node.length });
    text += node.textContent;
  }
  return { text, nodes };
}

export function characterAtPoint(doc, projection, x, y) {
  const caret = doc.caretPositionFromPoint?.(x, y);
  const fallback = !caret && doc.caretRangeFromPoint?.(x, y);
  const node = caret?.offsetNode || fallback?.startContainer;
  const offset = caret?.offset ?? fallback?.startOffset;
  const part = projection.nodes.find((entry) => entry.node === node);
  if (!part) return null;
  for (const index of [offset, offset - 1]) {
    if (index < 0 || index >= node.length) continue;
    const range = doc.createRange();
    range.setStart(node, index);
    range.setEnd(node, index + 1);
    if ([...range.getClientRects()].some((rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)) return part.start + index;
  }
  return null;
}

export function bindContextOutput({ controller, client, element, win }) {
  const doc = element.ownerDocument;
  if (!element.hasAttribute("tabindex")) element.tabIndex = 0;
  const cache = new WeakMap();
  const listeners = [];
  let timer;
  let menu;
  let restoreFocus;
  let savedSelection;
  let selectionCache;
  let selectionController;
  let pointerSelection;
  let disposed = false;
  let reportedError = "";
  function bind(target, type, handler, capture = false) {
    target.addEventListener(type, handler, capture);
    listeners.push(() => target.removeEventListener(type, handler, capture));
  }
  const stamp = () => [controller.revision, controller.session, controller.active().profile.id].join(":");
  function rows() {
    const virtual = element.querySelector(".output-rows");
    if (virtual) return [...virtual.querySelectorAll("[data-output-id]")];
    return [...element.children].flatMap((row) => row.matches(".sdwc-nowrap-block") ? [...row.children] : [row]);
  }
  function rowFor(target) {
    const virtual = target.closest?.("[data-output-id]");
    if (virtual && element.contains(virtual)) return virtual;
    return rows().find((row) => row === target || row.contains(target));
  }
  function close(focus = false) {
    const selection = doc.getSelection();
    const range = focus ? savedSelection || (selection && !selection.isCollapsed && element.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null) : null;
    menu?.remove();
    menu = null;
    savedSelection = null;
    if (focus && restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
    if (range && range.startContainer.isConnected && range.endContainer.isConnected) { selection.removeAllRanges(); selection.addRange(range); }
  }
  function available(action) {
    try {
      return action.type === "game-command" || (action.action === "clipboard.copy"
        ? typeof win.navigator.clipboard?.writeText === "function" : typeof client.openIDE === "function");
    } catch { return false; }
  }
  function warm() {
    if (disposed) return;
    const version = stamp();
    for (const row of rows()) {
      if (!row.hasAttribute("tabindex")) row.tabIndex = -1;
      const projection = projectOutputRow(row);
      const old = cache.get(row);
      if (old?.version === version && old.projection.text === projection.text) {
        old.projection = projection;
        continue;
      }
      const entry = { version, projection, matches: null };
      cache.set(row, entry);
      controller.match(projection.text).then((matches) => {
        if (!disposed && cache.get(row) === entry) entry.matches = matches;
      }).catch((error) => {
        if (!disposed && entry.version === stamp() && reportedError !== error.message) { reportedError = error.message; controller.report(error.message); }
      });
    }
  }
  function schedule() {
    win.clearTimeout(timer);
    timer = win.setTimeout(warm, 0);
    if (menu && !restoreFocus?.isConnected) close();
  }
  function selectionKey() {
    const selection = doc.getSelection();
    if (!selection || selection.isCollapsed || !element.contains(selection.anchorNode) || !element.contains(selection.focusNode)) return null;
    const descriptor = readOutputSelection(doc);
    if (!descriptor) return { key: stamp() + selection.toString(), text: selection.toString() };
    const manager = client.outputWindows;
    const values = { panel: descriptor.panel, start: { id: descriptor.start.id, offset: descriptor.start.offset }, end: { id: descriptor.end.id, offset: descriptor.end.offset } };
    return { key: JSON.stringify([stamp(), manager.history.epoch, manager.history.first, manager.routeState(), values]), descriptor: values };
  }
  function prepareSelection() {
    const selected = selectionKey();
    if (selected?.key === selectionCache?.key) return;
    selectionController?.abort();
    selectionCache = null;
    if (!selected) return;
    const state = selectionCache = { key: selected.key };
    if (!selected.descriptor) { state.text = selected.text; return; }
    const manager = client.outputWindows;
    const routing = manager.routeState();
    const signal = (selectionController = new AbortController()).signal;
    const { start, end, panel } = selected.descriptor;
    manager.snapshot(signal, start.id, end.id).then(async (snapshot) => {
      if (snapshot.first > start.id || snapshot.last < end.id) throw new Error("Selected history was removed. Select the text again.");
      const text = await copyOutputSelection(snapshot, selected.descriptor, { signal, scope: (record) => manager.panelFor(record, routing) === panel });
      if (!signal.aborted && selectionCache === state) state.text = text;
    }).catch((error) => { if (error.name !== "AbortError" && !disposed) controller.report(error.message); });
  }
  function show(items, context, position) {
    close();
    savedSelection = context.selectionRange;
    restoreFocus = context.row || element;
    menu = doc.createElement("div");
    menu.className = "context-menu-popup";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", context.kind === "selection" ? "Selected output actions" : "Reference actions");
    for (const item of items) {
      const button = doc.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.textContent = item.label;
      button.addEventListener("click", () => {
        try {
          if (item.choose) { item.choose(); return; }
          if (context.row && !context.row.isConnected) throw new Error("Output changed; open the menu again.");
          const result = controller.activate(item, context);
          Promise.resolve(result).catch((error) => controller.report(error.message));
          close(true);
        } catch (error) { controller.report(error.message); close(true); }
      });
      menu.append(button);
    }
    menu.addEventListener("keydown", (event) => {
      const buttons = [...menu.querySelectorAll("button")];
      const index = buttons.indexOf(doc.activeElement);
      const next = { ArrowDown: (index + 1) % buttons.length, ArrowUp: (index + buttons.length - 1) % buttons.length, Home: 0, End: buttons.length - 1 }[event.key];
      if (next !== undefined) { event.preventDefault(); event.stopPropagation(); buttons[next].focus(); }
      else if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); event.stopPropagation(); close(true); }
    });
    doc.body.append(menu);
    const rect = menu.getBoundingClientRect();
    menu.style.left = Math.max(0, Math.min(position.x, win.innerWidth - rect.width)) + "px";
    menu.style.top = Math.max(0, Math.min(position.y, win.innerHeight - rect.height)) + "px";
    menu.querySelector("button")?.focus({ preventScroll: true });
    if (savedSelection) { const selection = doc.getSelection(); selection.removeAllRanges(); selection.addRange(savedSelection.cloneRange()); }
  }
  function open(event, keyboard = false) {
    const automaticSelection = !keyboard && pointerSelection?.collapsed === true;
    pointerSelection = null;
    if (event.defaultPrevented || (!keyboard && event.shiftKey) || event.target.closest?.("a," + excluded)) return;
    const position = keyboard ? (() => { const rect = event.target.getBoundingClientRect(); return { x: rect.left, y: rect.top }; })() : { x: event.clientX, y: event.clientY };
    const context = { session: controller.session, revision: controller.revision, profile: controller.active().profile.id, doc };
    const selection = doc.getSelection();
    if (selection && !selection.isCollapsed && !automaticSelection) {
      prepareSelection();
      if (!selectionCache?.text || selectionCache.key !== selectionKey()?.key) return;
      if (!keyboard && ![...selection.getRangeAt(0).getClientRects()].some((rect) => position.x >= rect.left && position.x <= rect.right && position.y >= rect.top && position.y <= rect.bottom)) return;
      const items = controller.active().profile.selectionActions.filter(available);
      if (!items.some((action) => action.action === "clipboard.copy")) return;
      event.preventDefault();
      event.stopPropagation();
      show(items, { ...context, kind: "selection", text: selectionCache.text, selectionRange: selection.getRangeAt(0).cloneRange() }, position);
      return;
    }
    const row = rowFor(event.target) || (keyboard ? rows()[0] : null);
    const entry = row && cache.get(row);
    if (!entry?.matches || entry.version !== stamp() || entry.projection.text !== projectOutputRow(row).text) { schedule(); return; }
    const offset = keyboard ? null : characterAtPoint(doc, entry.projection, position.x, position.y);
    const matches = entry.matches.filter((match) => keyboard || (offset !== null && offset >= match.start && offset < match.end));
    const winners = [];
    for (const match of matches) if (!winners.some((target) => match.start < target.end && match.end > target.start)) winners.push(match);
    const usable = winners.filter((match) => controller.snapshot.rules.get(match.rule).actions.some(available)).sort((left, right) => left.start - right.start);
    if (!usable.length) return;
    // user-select: all ANSI spans can select themselves between right-down and contextmenu.
    if (automaticSelection) selection?.removeAllRanges();
    const openMatch = (match) => show(controller.snapshot.rules.get(match.rule).actions.filter(available), { ...context, kind: "token", row, match, text: match.text }, position);
    event.preventDefault();
    event.stopPropagation();
    if (!keyboard || usable.length === 1) openMatch(usable[0]);
    else {
      const targets = [];
      for (const match of usable) if (!targets.some((target) => match.start < target.end && match.end > target.start)) targets.push(match);
      show(targets.map((match) => ({ label: match.text, choose: () => openMatch(match) })), { ...context, kind: "token", row }, position);
    }
  }
  bind(element, "contextmenu", (event) => open(event));
  bind(element, "pointerdown", (event) => {
    pointerSelection = event.button === 2 ? { collapsed: doc.getSelection()?.isCollapsed !== false } : null;
  }, true);
  bind(element, "keydown", (event) => {
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) open(event, true);
    if (!client.outputWindows && ["ArrowUp", "ArrowDown"].includes(event.key) && !event.shiftKey && !event.target.closest?.("a," + excluded)) {
      const lines = rows();
      const index = lines.indexOf(rowFor(event.target));
      const next = lines[Math.max(0, Math.min(lines.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))];
      if (next) { event.preventDefault(); next.focus(); }
    }
  }, true);
  bind(doc, "selectionchange", prepareSelection);
  bind(doc, "pointerdown", (event) => { if (menu && !menu.contains(event.target)) close(); });
  bind(win, "blur", () => close());
  bind(element, "scroll", () => close(), true);
  const observer = new win.MutationObserver(schedule);
  observer.observe(element, { childList: true, subtree: true, characterData: true });
  const unsubscribe = controller.subscribe(() => { close(); selectionController?.abort(); selectionCache = null; schedule(); });
  controller.ready?.then(schedule);
  schedule();
  return () => { disposed = true; close(); selectionController?.abort(); win.clearTimeout(timer); observer.disconnect(); unsubscribe(); listeners.forEach((remove) => remove()); };
}
