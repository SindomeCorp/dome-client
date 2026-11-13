import { copyOutputSelection, readOutputSelection } from "./selection.js";

export function setupOutputClipboard(manager) {
  const { doc } = manager;
  let prepared;
  let timer;

  function discard() {
    clearTimeout(timer);
    prepared?.controller.abort();
    prepared = undefined;
  }

  function descriptor() {
    const selection = readOutputSelection(doc);
    if (!selection) return null;
    const view = manager.views[selection.panel];
    const first = view.index.indexOfId(selection.start.id);
    const last = view.index.indexOfId(selection.end.id);
    if (first < 0 || last < 0) return null;
    let mounted = 0;
    for (const id of view.mounted.keys()) if (id >= selection.start.id && id <= selection.end.id) mounted++;
    if (mounted === last - first + 1) return null;
    // Retain endpoint values, never DOM nodes or an entire history snapshot.
    const endpoints = {
      panel: selection.panel,
      start: { id: selection.start.id, offset: selection.start.offset },
      end: { id: selection.end.id, offset: selection.end.offset }
    };
    const state = manager.routeState();
    return {
      selection: endpoints, state,
      key: JSON.stringify([manager.history.epoch, state.open, state.generation, endpoints])
    };
  }

  async function prepare(current) {
    if (current.running) return;
    clearTimeout(timer);
    current.running = true;
    const { selection, state, controller } = current;
    try {
      const snapshot = await manager.snapshot(controller.signal, selection.start.id, selection.end.id);
      if (snapshot.first > selection.start.id) throw new Error("Some selected history was removed. Please select the text again.");
      const text = await copyOutputSelection(snapshot, selection, {
        signal: controller.signal, scope: (record) => manager.panelFor(record, state) === selection.panel
      });
      controller.signal.throwIfAborted();
      current.text = text;
      if (current.waiting) manager.report("Selected output is ready. Press Ctrl/Cmd+C or choose Copy again to copy it.");
    } catch (error) {
      if (error.name !== "AbortError") {
        if (prepared === current) discard();
        manager.report("Preparing selected output failed: " + error.message);
      }
    }
  }

  function refresh() {
    const next = descriptor();
    if (next?.key === prepared?.key) return prepared;
    discard();
    if (next) {
      prepared = { ...next, controller: new AbortController() };
      const current = prepared;
      timer = setTimeout(() => prepare(current), 80);
    }
    return prepared;
  }

  function onCopy(event) {
    if (event.defaultPrevented || event.target.closest?.("input, textarea, .ace_editor")) return;
    const current = refresh();
    if (!current) return; // Fully mounted selections keep native copying.
    // clipboardData is writable only during this event. Prepare large selections
    // in advance rather than depending on asynchronous clipboard permissions.
    event.preventDefault();
    if (current.text !== undefined) {
      try {
        if (!event.clipboardData?.setData) throw new Error("This browser did not provide access to the Copy action.");
        event.clipboardData.setData("text/plain", current.text);
        manager.report("Selected output copied.");
      } catch (error) {
        manager.report("Copying selected output failed: " + error.message);
      }
    } else {
      current.waiting = true;
      manager.report("Preparing selected output. Copy again when it is ready.");
      prepare(current);
    }
  }

  doc.addEventListener("selectionchange", refresh);
  doc.addEventListener("copy", onCopy);
  return {
    changed({ reset = false, routing = false } = {}) {
      if (reset || routing || (prepared && manager.history.first > prepared.selection.start.id)) discard();
    },
    cancel() {
      discard();
      doc.removeEventListener("selectionchange", refresh);
      doc.removeEventListener("copy", onCopy);
    }
  };
}
